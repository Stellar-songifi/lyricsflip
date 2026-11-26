// interceptors/activity.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { ActivityService } from '../services/activity.service';
import { ActivityType } from '../entities/activity.entity';

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly activityService: ActivityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      concatMap(async (response) => {
        const request = context.switchToHttp().getRequest();
        const userId = request.user?.id;
        const activityType = this.getActivityType(request);

        if (activityType && userId) {
          await this.activityService.createActivity({
            type: activityType,
            userId,
            data: this.getActivityData(request),
          });
        }
        return response;
      }),
    );
  }

  protected getActivityType(_request: any): ActivityType | null {
    return null; // subclasses override this
  }

  protected getActivityData(_request: any): Record<string, unknown> {
    return {}; // subclasses override this
  }
}
