import { SetMetadata } from "@nestjs/common";

export const ACCESS_ACTION_KEY = "accessAction";

// Marks an endpoint whose successful READ must leave an audit trail (opening
// a patient chart, exporting a report) - see AccessLogInterceptor.
export const LogAccess = (action: string) => SetMetadata(ACCESS_ACTION_KEY, action);
