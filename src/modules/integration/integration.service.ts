import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizarTipoAplicacion } from '@/common/utils/tipo-oficio.util';

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  private cachedToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Gets a valid token, renewing it if expired or not set.
   */
  async getToken(): Promise<string> {
    const now = Date.now();
    // Consider token expired 1 minute before actual expiration to be safe
    if (
      this.cachedToken &&
      this.tokenExpiry &&
      now < this.tokenExpiry - 60000
    ) {
      return this.cachedToken;
    }

    const authUrl = this.configService.get<string>('INTEGRATION_AUTH_URL');
    const authPayloadStr = this.configService.get<string>(
      'INTEGRATION_AUTH_PAYLOAD',
      '{}',
    );

    if (!authUrl) {
      throw new Error('INTEGRATION_AUTH_URL not configured in environment.');
    }

    this.logger.log(`Authenticating with ${authUrl} to obtain new token.`);

    let payload;
    try {
      payload = JSON.parse(authPayloadStr);
    } catch (err) {
      this.logger.error(
        'Failed to parse INTEGRATION_AUTH_PAYLOAD environment variable.',
      );
      payload = {};
    }

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Authentication failed: ${response.status} - ${errorText}`,
      );
      throw new Error(
        `Failed to authenticate with external REST service: ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Common naming conventions for access tokens
    const token =
      data.token || data.access_token || data.accessToken || data.jwt;

    if (!token) {
      this.logger.error('Token not found in auth response body.');
      throw new Error('Token not found in external service response.');
    }

    this.cachedToken = token as string;

    // Determine expiry from response or fallback to 1 hour
    const expiresIn = data.expires_in || data.expiresIn || 3600; // Seconds
    this.tokenExpiry = Date.now() + expiresIn * 1000;

    this.logger.log('Successfully acquired new authentication token.');
    return this.cachedToken;
  }

  /**
   * Notifies the receptor that a new batch is starting.
   * Returns the loteId assigned by the external service.
   */
  async startBatch(
    nombreArchivo: string,
    cantidadLotes: number,
    totalRegistros: number,
    tipoOficio: string,
  ): Promise<string> {
    const startUrl = this.configService.get<string>(
      'INTEGRATION_BATCH_START_URL',
    );
    if (!startUrl) {
      this.logger.warn(
        'INTEGRATION_BATCH_START_URL not configured. Skipping batch start.',
      );
      return 'LOCAL';
    }

    const token = await this.getToken();

    const requestBody = {
      nombreArchivo,
      cantidadLotes,
      totalRegistros,
      tipoOficio,
    };

    this.logger.log(
      `[startBatch] POST ${startUrl} -> ${JSON.stringify(requestBody)}`,
    );

    const response = await fetch(startUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `[startBatch] Respuesta ${response.status}: ${errorText}`,
      );
      throw new Error(`startBatch failed: ${response.status} - ${errorText}`);
    }

    const data: unknown = await response.json();
    this.logger.log(`[startBatch] Respuesta recibida: ${JSON.stringify(data)}`);

    let loteId: string;

    if (typeof data === 'number' || typeof data === 'string') {
      loteId = String(data);
    } else if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      const loteIdValue = obj.loteId ?? obj.batchId ?? obj.id ?? obj.lotId;
      if (loteIdValue === undefined || loteIdValue === null) {
        throw new Error('loteId not found in startBatch response.');
      }
      loteId = String(loteIdValue);
    } else {
      throw new Error(
        `Unexpected startBatch response: ${JSON.stringify(data)}`,
      );
    }
    this.logger.log(`[startBatch] Lote iniciado. loteId: ${loteId}`);
    return loteId;
  }

  /**
   * Normalizes null values in the payload to appropriate defaults.
   * - String fields with null → "0"
   * - Number fields with null → 0
   * - Arrays with null elements → filtered out
   *
   * `infoCliente.tipoAplicacion` NO se resuelve acá: depende de
   * `oficio.tipoOficio` (el default "CONGELAR" solo aplica a EMBARGO), que no
   * es visible desde esta recursión. Se ajusta en `sendData` sobre el objeto
   * raíz — ver `normalizarTipoAplicacion`.
   */
  private normalizePayload(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.normalizePayload(item));
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    const normalized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        normalized[key] = '0';
      } else if (Array.isArray(value)) {
        normalized[key] = value
          .map((item) => this.normalizePayload(item))
          .filter((item) => item !== null && item !== undefined);
      } else if (typeof value === 'object') {
        normalized[key] = this.normalizePayload(value);
      } else if (
        typeof value === 'number' &&
        (key === 'cuentaDepositoJudicial' ||
          key === 'numeroCuenta' ||
          key === 'numeroId' ||
          key === 'numeroRadicado')
      ) {
        normalized[key] = String(value);
      } else {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  /**
   * Sends JSON data to the configured target endpoint using the stored token.
   * @param finalJson payload to send
   * @param source optional source identifier (e.g., 'IA_OK', 'EXCEL_OK')
   */
  async sendData(finalJson: any, source: string): Promise<boolean> {
    const dataUrl = this.configService.get<string>('INTEGRATION_DATA_URL');
    if (!dataUrl) {
      this.logger.warn(
        'INTEGRATION_DATA_URL not configured. Skipping external integration dispatch.',
      );
      return false;
    }

    try {
      const token = await this.getToken();

      const normalizedJson = this.normalizePayload(finalJson);

      // Último punto de control antes de salir al sistema externo: el default
      // "CONGELAR" solo aplica a EMBARGO. En DESEMBARGO/ALCANCE se respeta un
      // CONGELAR/DEBITAR explícito y cualquier otra cosa queda en "0".
      if (normalizedJson?.infoCliente) {
        normalizedJson.infoCliente.tipoAplicacion = normalizarTipoAplicacion(
          normalizedJson?.oficio?.tipoOficio,
          normalizedJson.infoCliente.tipoAplicacion,
        );
      }

      const response = await fetch(dataUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(normalizedJson),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `[sendData:${source}] POST ${dataUrl} -> ${JSON.stringify(normalizedJson)} Respuesta ${response.status}: ${errorText}`,
        );
        return false;
      }

      this.logger.log(`[sendData:${source}] Enviado correctamente.`);
      return true;
    } catch (error: any) {
      this.logger.error(
        `Integration error during [${source}]: ${error.message}`,
      );
      return false;
    }
  }
}
