import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// export type ApplicationDocument = HydratedDocument<Application>;

@Schema({ timestamps: true }) // 생성/수정시간(createdAt, updatedAt) 자동 생성
export class ApplyHistory {
    @Prop({ required: true })
    userId: string; // 사용자 식별자

    @Prop({ required: true })
    platform: string; // 'jobkorea'

    @Prop({ required: true })
    company: string;

    @Prop({ required: true })
    position: string;

    @Prop()
    status: string;

    @Prop()
    appliedAt: string; // 지원일 (예: 2025.12.31)
}

export const ApplyHistorySchema = SchemaFactory.createForClass(ApplyHistory);