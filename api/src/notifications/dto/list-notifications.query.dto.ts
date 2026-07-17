import { PaginationQueryDto } from "../../common/dto/pagination.dto"

/**
 * Query parameters for `GET /notifications`. Paging behaviour matches the
 * rest of the API (1-indexed page, limit capped at 100).
 */
export class ListNotificationsQueryDto extends PaginationQueryDto {}
