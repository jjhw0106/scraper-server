import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // CORS 허용 (프론트엔드 연동 필수)
  app.enableCors({
    origin: true, // 개발 단계에서는 모든 origin 허용
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  
  await app.listen(process.env.PORT ?? 4000); // 포트 4000으로 설정 (Nuxt 3000과 충돌 방지)
}
bootstrap();