import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

import { LlmRole } from '../llm.types';

export class ChatMessageDto {
  @IsIn(['system', 'user', 'assistant'])
  role: LlmRole;

  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  content: string;
}
