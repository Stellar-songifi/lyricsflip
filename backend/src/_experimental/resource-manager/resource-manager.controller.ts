import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResourceManagerService } from './resource-manager.service';
import { ScalingManagerService } from './scaling-manager.service';
import { AlertService } from './alert.service';
import { CostOptimizerService } from './cost-optimizer.service';
import { CreateScalingRuleDto, UpdateScalingRuleDto } from './dto/scaling-rule.dto';
import { CreateAlertConfigDto, UpdateAlertConfigDto } from './dto/alert-config.dto';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('resource-manager')
@Controller('resource-manager')
export class ResourceManagerController {
  constructor(
    private resourceManagerService: ResourceManagerService,
    private scalingManagerService: ScalingManagerService,
    private alertService: AlertService,
    private costOptimizerService: CostOptimizerService,
  ) {}

  @Get('status')
  // @UseGuards(JwtAuthGuard)
  async getSystemStatus() {
    return this.resourceManagerService.getSystemStatus();
  }

  @Get('utilization')
  // @UseGuards(JwtAuthGuard)
  async getResourceUtilization() {
    return this.resourceManagerService.getResourceUtilization();
  }

  @Get('scaling/rules')
  // @UseGuards(JwtAuthGuard)
  async getScalingRules(@Query('resourceType') resourceType?: string) {
    return this.scalingManagerService.getScalingRules(resourceType);
  }

  @Post('scaling/rules')
  // @UseGuards(JwtAuthGuard)
  async createScalingRule(@Body() dto: CreateScalingRuleDto) {
    return this.scalingManagerService.createScalingRule(dto);
  }

  @Post('scaling/rules/update')
  // @UseGuards(JwtAuthGuard)
  async updateScalingRule(@Body() dto: UpdateScalingRuleDto) {
    return this.scalingManagerService.updateScalingRule(dto);
  }

  @Delete('scaling/rules/:id')
  // @UseGuards(JwtAuthGuard)
  async deleteScalingRule(@Param('id') id: string) {
    return this.scalingManagerService.deleteScalingRule(id);
  }

  @Get('scaling/events')
  // @UseGuards(JwtAuthGuard)
  async getScalingEvents(@Query('limit') limit?: number) {
    return this.scalingManagerService.getScalingEvents(limit ? parseInt(limit) : undefined);
  }

  @Post('scaling/manual')
  // @UseGuards(JwtAuthGuard)
  async manualScaling(
    @Body() data: { resourceType: string; targetCount: number; reason: string }
  ) {
    return this.resourceManagerService.manualScaling(
      data.resourceType,
      data.targetCount,
      data.reason,
    );
  }

  @Get('alerts/configs')
  // @UseGuards(JwtAuthGuard)
  async getAlertConfigs() {
    return this.alertService.getAlertConfigs();
  }

  @Post('alerts/configs')
  // @UseGuards(JwtAuthGuard)
  async createAlertConfig(@Body() dto: CreateAlertConfigDto) {
    return this.alertService.createAlertConfig(dto);
  }

  @Post('alerts/configs/update')
  // @UseGuards(JwtAuthGuard)
  async updateAlertConfig(@Body() dto: UpdateAlertConfigDto) {
    return this.alertService.updateAlertConfig(dto);
  }

  @Delete('alerts/configs/:id')
  // @UseGuards(JwtAuthGuard)
  async deleteAlertConfig(@Param('id') id: string) {
    return this.alertService.deleteAlertConfig(id);
  }

  @Get('alerts/recent')
  // @UseGuards(JwtAuthGuard)
  async getRecentAlerts(@Query('limit') limit?: number) {
    return this.alertService.getRecentAlerts(limit ? parseInt(limit) : undefined);
  }

  @Get('cost/analysis')
  // @UseGuards(JwtAuthGuard)
  async getCostAnalysis() {
    return this.costOptimizerService.getCostAnalysis();
  }
}