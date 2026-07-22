-- Migration: 20260722_nombre_oficio_final_usado
-- Date: 2026-07-22
-- Description: Deduplicación PERSISTENTE de `nombreOficioFinal` contra la base
--              de datos, en vez de solo contra el filesystem.
--
--              Hoy `resolverRutaSinColision` (file-destination.util.ts) evita
--              que dos PDFs con el mismo nombreOficioFinal se pisen como
--              archivo físico, pero SOLO detecta colisiones dentro de la
--              subcarpeta de la fecha del día actual (carpetaFechaBogota()).
--              Un nombreOficioFinal ya usado AYER (o cualquier día anterior)
--              nunca se detecta, porque esa carpeta antigua no se vuelve a
--              mirar.
--
--              Se crea una tabla NUEVA y dedicada (en vez de agregar una
--              columna a `documents` o `excel_records`) porque esta tabla no
--              representa el ciclo de vida de un documento ni de una fila de
--              Excel — representa la "sombrilla" de nombres de negocio ya
--              asignados, que aplica por igual a ambos flujos (individual vía
--              model.processor.ts y masivo vía massive-excel.service.ts) y no
--              calza limpio en ninguna de las dos tablas existentes.
--
--              Diseño: columna con constraint UNIQUE. La reserva atómica del
--              nombre (evita que dos jobs en paralelo se "roben" el mismo
--              nombre) se resuelve en aplicación (NombreOficioFinalService,
--              en src/common/services/) con un loop de INSERT: intenta el
--              candidato base y, si el INSERT viola la constraint UNIQUE
--              (Postgres 23505 / Prisma P2002), reintenta con sufijos
--              incrementales "-1", "-2", ... hasta que un INSERT tenga éxito.
--              Ese INSERT exitoso es al mismo tiempo el chequeo Y la reserva
--              (no hay ventana de carrera entre "verificar" y "guardar").
--
--              A diferencia de hoy (donde el sufijo de colisión era SOLO
--              cosmético del archivo físico y nombreOficioFinal en DB nunca
--              lo llevaba), el sufijo devuelto por esta tabla pasa a ser
--              parte OFICIAL de nombreOficioFinal: es el valor que se
--              persiste en Document/ExcelRecord, el que se envía al sistema
--              externo, y el que se usa para nombrar el archivo físico.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "nombres_oficio_final_usados" (
  "id"                  TEXT          NOT NULL,
  "nombre_oficio_final" TEXT          NOT NULL,
  "created_at"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nombres_oficio_final_usados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "nombres_oficio_final_usados_nombre_oficio_final_key"
  ON "nombres_oficio_final_usados" ("nombre_oficio_final");
