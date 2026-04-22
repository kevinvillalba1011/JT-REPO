import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DefaultProfile } from './profiles/default.profile';
import { BbvaProfile } from './profiles/bbva.profile';
import { DavibankProfile } from './profiles/davibank.profile';

@Global()
@Module({
  providers: [
    {
      provide: 'TENANT_PROFILE',
      useFactory: (configService: ConfigService) => {
        const tenant = configService.get<string>('TENANT_PROFILE', 'default');

        switch (tenant) {
          case 'davibank':
            return DavibankProfile;
          case 'bbva':
            return BbvaProfile;
          case 'default':
            return DefaultProfile;
          default:
            return DefaultProfile;
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: ['TENANT_PROFILE'],
})
export class TenantModule {}
