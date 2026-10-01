import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const adminApiKey = this.configService.get<string>('app.adminApiKey');
    if (!adminApiKey) {
      const env = this.configService.get<string>('app.env');
      if (env === 'development' || env === 'test') {
        return true;
      }
      throw new UnauthorizedException('Clé d\'API invalide ou absente');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('Clé d\'API invalide ou absente');
    }

    if (apiKey.length !== adminApiKey.length) {
      throw new UnauthorizedException('Clé d\'API invalide ou absente');
    }

    const isMatch = timingSafeEqual(
      Buffer.from(apiKey),
      Buffer.from(adminApiKey),
    );

    if (!isMatch) {
      throw new UnauthorizedException('Clé d\'API invalide ou absente');
    }

    return true;
  }
}
