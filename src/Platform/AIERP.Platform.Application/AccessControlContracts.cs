using AIERP.Platform.Domain;

namespace AIERP.Platform.Application;

public sealed record TenantPermissionRuleCreateRequest(TenantPermissionSubjectType SubjectType, string? SubjectRole,
    Guid? SubjectUserId, string PermissionCode, TenantPermissionEffect Effect, string? ResourceType = null,
    string? AttributeName = null, TenantPermissionConditionOperator? AttributeOperator = null, string? AttributeValue = null);

public sealed record TenantPermissionRuleView(Guid Id, TenantPermissionSubjectType SubjectType, string? SubjectRole,
    Guid? SubjectUserId, string? SubjectDisplayName, string PermissionCode, string ResourceType,
    string Action, TenantPermissionEffect Effect, string? ResourceConditionType, string? AttributeName,
    TenantPermissionConditionOperator? AttributeOperator, string? AttributeValue, bool IsActive,
    Guid? CreatedByUserId, DateTimeOffset CreatedAt);

public sealed record TenantPermissionMemberView(Guid UserId, string Email, string DisplayName, string Role);
