import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

      this.logger.log(
        `Sending JSON data to external service for source [${source}].`,
      );

      this.logger.log(
        `🚀 ~ IntegrationService ~ sendData ~ finalJson:`,
        dataUrl,
        finalJson,
      );
      const response = await fetch(dataUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(finalJson),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to send data to REST service: ${response.status} - ${errorText}`,
        );
        return false;
      }

      this.logger.log(
        `Successfully sent data from [${source}] to external API.`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `Integration error during [${source}]: ${error.message}`,
      );
      return false;
    }
  }
}
