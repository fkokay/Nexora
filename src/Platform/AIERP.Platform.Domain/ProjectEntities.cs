namespace AIERP.Platform.Domain;

public enum OperationalProjectStatus { Draft = 1, Active = 2, OnHold = 3, Completed = 4, Cancelled = 5 }
public enum ProjectTaskStatus { Open = 1, InProgress = 2, Blocked = 3, Completed = 4, Cancelled = 5 }

/// <summary>Operational project tracking. Budget is an entered planning value, not a ledger balance.</summary>
public sealed class OperationalProject
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public Guid? CustomerAccountId { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public OperationalProjectStatus Status { get; set; } = OperationalProjectStatus.Draft;
    public decimal BudgetAmount { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public string? Notes { get; set; }
    public Guid CreatedByUserId { get; set; }
    public Guid UpdatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class OperationalProjectTask
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public decimal PlannedHours { get; set; }
    public ProjectTaskStatus Status { get; set; } = ProjectTaskStatus.Open;
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Append-only planned resource allocation record; not payroll or actual cost posting.</summary>
public sealed class OperationalProjectResourceAllocation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? TaskId { get; set; }
    public Guid? EmployeeId { get; set; }
    public string ResourceName { get; set; } = "";
    public decimal PlannedHours { get; set; }
    public decimal? PlannedHourlyCost { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public string? Notes { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Append-only actual project time capture. This is operational tracking, not payroll.</summary>
public sealed class OperationalProjectTimeEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? TaskId { get; set; }
    public Guid UserId { get; set; }
    public DateOnly WorkDate { get; set; }
    public decimal Hours { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
