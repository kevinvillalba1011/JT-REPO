-- DropIndex
DROP INDEX IF EXISTS "excel_records_id_demandado_idx";

-- AlterTable: hacer md5Hash opcional (dedup ahora es por nombre de archivo)
ALTER TABLE "documents" ALTER COLUMN "hash_md5" DROP NOT NULL;

-- AlterTable: restructurar excel_records (nuevo schema con payload JSON)
-- Las filas existentes (formato anterior) quedarán con valores por defecto en las
-- nuevas columnas; al ser registros de cargas previas, se recomienda truncar la tabla
-- si no se necesitan conservar.
ALTER TABLE "excel_records" DROP COLUMN IF EXISTS "consecutivo",
DROP COLUMN IF EXISTS "id_demandado",
DROP COLUMN IF EXISTS "nombre",
DROP COLUMN IF EXISTS "nro_oficio",
DROP COLUMN IF EXISTS "resolucion1",
DROP COLUMN IF EXISTS "resolucion2",
DROP COLUMN IF EXISTS "resolucion3",
DROP COLUMN IF EXISTS "resolucion4",
ADD COLUMN     "numero_fila" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payload" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "tipo_oficio" TEXT NOT NULL DEFAULT 'DESCONOCIDO';

-- Quitar los defaults temporales: las nuevas filas deben enviar estos valores explícitamente
ALTER TABLE "excel_records"
  ALTER COLUMN "numero_fila" DROP DEFAULT,
  ALTER COLUMN "payload" DROP DEFAULT,
  ALTER COLUMN "tipo_oficio" DROP DEFAULT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "excel_records_nombre_excel_idx" ON "excel_records"("nombre_excel");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "excel_records_tipo_oficio_idx" ON "excel_records"("tipo_oficio");
