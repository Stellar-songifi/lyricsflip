// interceptors/activity.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ActivityService } from '../services/activity.service';
import { ActivityType } from '../entities/activity.entity';

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly activityService: ActivityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(async () => {
        const request = context.switchToHttp().getRequest();
        const userId = request.user.id;
        const activityType = this.getActivityType(request);
        
        if (activityType) {
          await this.activityService.create({
            type: activityType,
            userId,
            data: this.getActivityData(request),
          });
        }
      }),
    );
  }

  private getActivityType(request: any): ActivityType | undefined {
    // Logic to determine activity type based on request
    return undefined;
  }

  private getActivityData(request: any): any {
    // Logic to extract relevant activity data from request
  }
}