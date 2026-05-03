import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { ChatRequestDto } from './dto/chat-request.dto';
import { WorkoutPlanRequestDto } from './dto/workout-plan-request.dto';
import { LlmService } from './llm.service';
import { LlmChatResponse, WorkoutPlanGenerationResponse } from './llm.types';

@Controller('llm')
@UseGuards(SupabaseAuthGuard)
export class LlmController {
  constructor(private readonly llm: LlmService) {}

  @Post('chat')
  chat(@Body() body: ChatRequestDto): Promise<LlmChatResponse> {
    return this.llm.chat(body);
  }

  @Post('workout-plan')
  generateWorkoutPlan(
    @Body() body: WorkoutPlanRequestDto,
  ): Promise<WorkoutPlanGenerationResponse> {
    return this.llm.generateWorkoutPlan(body);
  }
}
