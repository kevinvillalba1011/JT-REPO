import { Global, Module } from '@nestjs/common';
import { NombreOficioFinalService } from './nombre-oficio-final.service';

@Global()
@Module({
  providers: [NombreOficioFinalService],
  exports: [NombreOficioFinalService],
})
export class NombreOficioFinalModule {}
