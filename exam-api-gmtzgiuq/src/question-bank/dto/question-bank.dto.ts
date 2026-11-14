import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  QB_DIFFICULTIES,
  QB_MODES,
  QB_PROGRESS,
  type QbDifficulty,
  type QbMode,
  type QbProgress,
} from '../question-bank-pool';

export const MAX_SESSION_TOPICS = 100;
export const MAX_SESSION_LIMIT = 200;
export const DEFAULT_SESSION_LIMIT = 50;

const MODE_MESSAGE = 'mode ต้องเป็น bank หรือ challenge';

/** `?mode=` of the GET routes; not sent = bank. */
export class QbModeQueryDto {
  @IsOptional()
  @IsIn(QB_MODES, { message: MODE_MESSAGE })
  mode?: QbMode;
}

/** Body of POST /question-bank/sessions. */
export class CreateQbSessionDto {
  @IsUUID('all', { message: 'รหัสวิชา (subjectId) ไม่ถูกต้อง' })
  subjectId: string;

  @IsIn(QB_MODES, { message: MODE_MESSAGE })
  mode: QbMode;

  // Topics of the subject to practise; not sent / [] = every topic.
  // Ids that are not active topics of the subject are ignored.
  @IsOptional()
  @IsArray({ message: 'topicIds ต้องเป็นรายการ' })
  @ArrayMaxSize(MAX_SESSION_TOPICS, {
    message: `เลือกได้ไม่เกิน ${MAX_SESSION_TOPICS} บท`,
  })
  @IsUUID('all', { each: true, message: 'รหัสบท (topicIds) ไม่ถูกต้อง' })
  topicIds?: string[];

  // bank mode only (ignored in challenge mode); not sent / [] = all
  @IsOptional()
  @IsArray({ message: 'difficulties ต้องเป็นรายการ' })
  @ArrayMaxSize(QB_DIFFICULTIES.length, {
    message: 'ระดับความยากซ้ำกัน',
  })
  @IsIn(QB_DIFFICULTIES, {
    each: true,
    message: 'ระดับความยากต้องเป็น easy, medium หรือ hard_challenge',
  })
  difficulties?: QbDifficulty[];

  // not 'all' needs a login (401 QB_LOGIN_REQUIRED); not sent = all
  @IsOptional()
  @IsIn(QB_PROGRESS, {
    message: 'progress ต้องเป็น all, undone, done หรือ wrong',
  })
  progress?: QbProgress;

  @IsOptional()
  @IsInt({ message: 'จำนวนข้อ (limit) ต้องเป็นจำนวนเต็ม' })
  @Min(1, {
    message: `จำนวนข้อ (limit) ต้องอยู่ระหว่าง 1–${MAX_SESSION_LIMIT}`,
  })
  @Max(MAX_SESSION_LIMIT, {
    message: `จำนวนข้อ (limit) ต้องอยู่ระหว่าง 1–${MAX_SESSION_LIMIT}`,
  })
  limit?: number;
}
