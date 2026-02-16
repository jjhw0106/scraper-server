import { Test, TestingModule } from '@nestjs/testing';
import { ScraperService } from './scraper.service';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ApplyHistory, ApplyHistorySchema } from './schemas/apply-history.schema';
import { ConfigModule } from '@nestjs/config';
import { Model } from 'mongoose';

describe('ScraperService (Database Integration Test)', () => {
  let service: ScraperService;
  let applyHistoryModel: Model<ApplyHistory>;
  let module: TestingModule;

  beforeAll(async () => {
    // 실제 DB와 연동하기 위해 모듈 환경을 구축합니다.
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(), // .env 로드
        MongooseModule.forRoot(process.env.MONGODB_URI!), // 실제 MongoDB 연결
        MongooseModule.forFeature([{ name: ApplyHistory.name, schema: ApplyHistorySchema }]),
      ],
      providers: [ScraperService],
    }).compile();

    service = module.get<ScraperService>(ScraperService);
    // 테스트에서 모델에 직접 접근하기 위해 주입받습니다.
    applyHistoryModel = module.get<Model<ApplyHistory>>(getModelToken(ApplyHistory.name));
  });

  // 모든 테스트가 끝나면 DB 연결을 닫습니다.
  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('더미 데이터를 성공적으로 MongoDB에 저장하고 조회해야 함', async () => {
    const testUserId = 'test_user_id_123';
    const dummyData = {
      userId: testUserId,
      platform: 'jobkorea',
      company: '테스트 컴퍼니 (Jest)',
      position: '백엔드 개발자',
      status: '지원완료',
      appliedAt: '2026.01.03',
    };

    // 1. 기존 테스트 데이터 삭제
    await applyHistoryModel.deleteMany({ userId: testUserId });

    // 2. 저장 테스트 (ScraperService의 모델을 직접 사용하여 저장 시도)
    const created = await applyHistoryModel.create(dummyData);
    expect(created._id).toBeDefined();
    expect(created.company).toBe(dummyData.company);

    // 3. 조회 테스트
    const found = await applyHistoryModel.findOne({ userId: testUserId });
    expect(found).toBeDefined();
    expect(found?.company).toBe(dummyData.company);

    console.log('✅ MongoDB 통합 테스트 완료: 데이터가 성공적으로 저장되고 조회되었습니다.');
    console.log('저장된 문서 ID:', created._id);

    // 4. 테스트 데이터 청소 (선택 사항)
    // await applyHistoryModel.deleteMany({ userId: testUserId });
  });
});
