using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class InitialTenantDatabase : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Action = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Resource = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditEvents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tenants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Slug = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    BaseCurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false, defaultValue: "TRY"),
                    AuditRetentionDays = table.Column<int>(type: "int", nullable: false, defaultValue: 365),
                    AuditLastPurgeAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tenants", x => x.Id);
                    table.CheckConstraint("CK_Tenants_AuditRetentionDays", "[AuditRetentionDays] >= 30 AND [AuditRetentionDays] <= 3650");
                });

            migrationBuilder.CreateTable(
                name: "CustomerCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_CustomerCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CustomerGroups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerGroups", x => x.Id);
                    table.UniqueConstraint("AK_CustomerGroups_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_CustomerGroups_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FinancialAccounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinancialAccounts", x => x.Id);
                    table.UniqueConstraint("AK_FinancialAccounts_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_FinancialAccounts_TenantId_Id_CurrencyCode", x => new { x.TenantId, x.Id, x.CurrencyCode });
                    table.ForeignKey(
                        name: "FK_FinancialAccounts_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FxRevaluationVouchers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AsOfDate = table.Column<DateOnly>(type: "date", nullable: false),
                    BaseCurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FxRevaluationVouchers", x => x.Id);
                    table.UniqueConstraint("AK_FxRevaluationVouchers_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_FxRevaluationVouchers_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrderCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrderCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseOrderCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseOrderCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseReceiptCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseReceiptCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseReceiptCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseRequestCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseRequestCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseRequestCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseRequestCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    RequestDate = table.Column<DateOnly>(type: "date", nullable: false),
                    NeededByDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    ReviewNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseRequests", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseRequests_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseRequests_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuoteCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuoteCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesInvoiceCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesInvoiceCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_SalesInvoiceCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SalesInvoiceCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesOrderCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesOrderCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_SalesOrderCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SalesOrderCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesQuoteCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesQuoteCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_SalesQuoteCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SalesQuoteCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockItemCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockItemCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_StockItemCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_StockItemCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Barcode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Category = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    MinimumStock = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    TrackingMode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false, defaultValue: "None"),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockItems", x => x.Id);
                    table.UniqueConstraint("AK_StockItems_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_StockItems_MinimumStockNonNegative", "[MinimumStock] >= 0");
                    table.ForeignKey(
                        name: "FK_StockItems_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TenantExchangeRates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    RateDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    Rate = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantExchangeRates", x => x.Id);
                    table.UniqueConstraint("AK_TenantExchangeRates_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantExchangeRates_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WarehouseCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehouseCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_WarehouseCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_WarehouseCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Warehouses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Warehouses", x => x.Id);
                    table.UniqueConstraint("AK_Warehouses_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_Warehouses_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CustomerCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_CustomerCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldDefinitionRevisions_CustomerCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "CustomerCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CustomerAccounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    TaxNumber = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    GroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    RiskLimit = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    PaymentTermDays = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerAccounts", x => x.Id);
                    table.UniqueConstraint("AK_CustomerAccounts_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_CustomerAccounts_CustomerGroups_TenantId_GroupId",
                        columns: x => new { x.TenantId, x.GroupId },
                        principalTable: "CustomerGroups",
                        principalColumns: new[] { "TenantId", "Id" });
                    table.ForeignKey(
                        name: "FK_CustomerAccounts_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BankStatements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    OpeningBalance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ClosingBalance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankStatements", x => x.Id);
                    table.UniqueConstraint("AK_BankStatements_TenantId_Id_AccountId_CurrencyCode", x => new { x.TenantId, x.Id, x.AccountId, x.CurrencyCode });
                    table.ForeignKey(
                        name: "FK_BankStatements_FinancialAccounts_TenantId_AccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.AccountId, x.CurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BankStatements_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FinancialAccountTransfers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    FromAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ToAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    ToCurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    TransferDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DestinationAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ExchangeRate = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinancialAccountTransfers", x => x.Id);
                    table.UniqueConstraint("AK_FinancialAccountTransfers_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_FinancialAccountTransfers_AmountPositive", "[Amount] > 0");
                    table.CheckConstraint("CK_FinancialAccountTransfers_DestinationAmountPositive", "[DestinationAmount] > 0");
                    table.CheckConstraint("CK_FinancialAccountTransfers_ExchangeRatePositive", "[ExchangeRate] > 0");
                    table.CheckConstraint("CK_FinancialAccountTransfers_SameCurrencyRate", "[CurrencyCode] <> [ToCurrencyCode] OR [ExchangeRate] = 1");
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransfers_FinancialAccounts_TenantId_FromAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.FromAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_ToCurrencyCode",
                        columns: x => new { x.TenantId, x.ToAccountId, x.ToCurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransfers_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FxRevaluationVoucherLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VoucherId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CounterpartyName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    OutstandingAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    InvoiceDateRate = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: false),
                    ClosingRate = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: false),
                    PreviousAdjustmentBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TargetAdjustmentBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    AdjustmentBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DebitAccount = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    CreditAccount = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DebitBaseAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreditBaseAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FxRevaluationVoucherLines", x => x.Id);
                    table.UniqueConstraint("AK_FxRevaluationVoucherLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_FxRevaluationVoucherLines_AmountsNonNegative", "[OutstandingAmount] >= 0 AND [DebitBaseAmount] >= 0 AND [CreditBaseAmount] >= 0");
                    table.CheckConstraint("CK_FxRevaluationVoucherLines_Balanced", "[DebitBaseAmount] = [CreditBaseAmount]");
                    table.ForeignKey(
                        name: "FK_FxRevaluationVoucherLines_FxRevaluationVouchers_TenantId_VoucherId",
                        columns: x => new { x.TenantId, x.VoucherId },
                        principalTable: "FxRevaluationVouchers",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FxRevaluationVoucherLines_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrderCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrderCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseOrderCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseOrderCustomFieldDefinitionRevisions_PurchaseOrderCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseOrderCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseReceiptCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseReceiptCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseReceiptCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptCustomFieldDefinitionRevisions_PurchaseReceiptCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseReceiptCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseRequestCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseRequestCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseRequestCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseRequestCustomFieldDefinitionRevisions_PurchaseRequestCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseRequestCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseRequestCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseRequestCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseRequestCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PurchaseRequestCustomFieldValueRevisions_PurchaseRequestCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseRequestCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseRequestCustomFieldValueRevisions_PurchaseRequests_TenantId_PurchaseRequestId",
                        columns: x => new { x.TenantId, x.PurchaseRequestId },
                        principalTable: "PurchaseRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseRequestCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseRequestCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseRequestCustomFieldValues", x => new { x.TenantId, x.PurchaseRequestId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_PurchaseRequestCustomFieldValues_PurchaseRequestCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseRequestCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseRequestCustomFieldValues_PurchaseRequests_PurchaseRequestId",
                        column: x => x.PurchaseRequestId,
                        principalTable: "PurchaseRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PurchaseRequestCustomFieldValues_PurchaseRequests_TenantId_PurchaseRequestId",
                        columns: x => new { x.TenantId, x.PurchaseRequestId },
                        principalTable: "PurchaseRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuoteCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseSupplierQuoteCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesInvoiceCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesInvoiceCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_SalesInvoiceCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SalesInvoiceCustomFieldDefinitionRevisions_SalesInvoiceCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "SalesInvoiceCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesInvoiceCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesOrderCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesOrderCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_SalesOrderCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SalesOrderCustomFieldDefinitionRevisions_SalesOrderCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "SalesOrderCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrderCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesQuoteCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesQuoteCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_SalesQuoteCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SalesQuoteCustomFieldDefinitionRevisions_SalesQuoteCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "SalesQuoteCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesQuoteCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockItemCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockItemCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_StockItemCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_StockItemCustomFieldDefinitionRevisions_StockItemCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "StockItemCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockItemCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseRequestLines",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseRequestLines", x => new { x.TenantId, x.PurchaseRequestId, x.LineNumber });
                    table.CheckConstraint("CK_PurchaseRequestLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_PurchaseRequestLines_PurchaseRequests_TenantId_PurchaseRequestId",
                        columns: x => new { x.TenantId, x.PurchaseRequestId },
                        principalTable: "PurchaseRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PurchaseRequestLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockItemCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockItemCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StockItemCustomFieldValueRevisions_StockItemCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "StockItemCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockItemCustomFieldValueRevisions_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockItemCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockItemCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockItemCustomFieldValues", x => new { x.TenantId, x.StockItemId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_StockItemCustomFieldValues_StockItemCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "StockItemCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockItemCustomFieldValues_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StockItemUnitConversions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    FactorToBase = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockItemUnitConversions", x => x.Id);
                    table.UniqueConstraint("AK_StockItemUnitConversions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_StockItemUnitConversions_FactorPositive", "[FactorToBase] > 0");
                    table.ForeignKey(
                        name: "FK_StockItemUnitConversions_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WarehouseCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehouseCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_WarehouseCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_WarehouseCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehouseCustomFieldDefinitionRevisions_WarehouseCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "WarehouseCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryTransfers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FromWarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ToWarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    TransferDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryTransfers", x => x.Id);
                    table.UniqueConstraint("AK_InventoryTransfers_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_InventoryTransfers_Warehouses_TenantId_FromWarehouseId",
                        columns: x => new { x.TenantId, x.FromWarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransfers_Warehouses_TenantId_ToWarehouseId",
                        columns: x => new { x.TenantId, x.ToWarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WarehouseCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehouseCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WarehouseCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehouseCustomFieldValueRevisions_WarehouseCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "WarehouseCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehouseCustomFieldValueRevisions_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WarehouseCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehouseCustomFieldValues", x => new { x.TenantId, x.WarehouseId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_WarehouseCustomFieldValues_WarehouseCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "WarehouseCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehouseCustomFieldValues_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CustomerAddresses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    Label = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    AddressLine = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    City = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    District = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    PostalCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    CountryCode = table.Column<string>(type: "nchar(2)", fixedLength: true, maxLength: 2, nullable: false),
                    IsDefault = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerAddresses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomerAddresses_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CustomerCollections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CollectionDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PaymentMethod = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    FinancialAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerCollections", x => x.Id);
                    table.UniqueConstraint("AK_CustomerCollections_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_CustomerCollections_TenantId_Id_CurrencyCode", x => new { x.TenantId, x.Id, x.CurrencyCode });
                    table.CheckConstraint("CK_CustomerCollections_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_CustomerCollections_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerCollections_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.FinancialAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerCollections_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CustomerCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldValueRevisions_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldValueRevisions_CustomerCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "CustomerCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CustomerCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerCustomFieldValues", x => new { x.TenantId, x.CustomerId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldValues_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldValues_CustomerCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "CustomerCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    QuoteDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ValidUntil = table.Column<DateOnly>(type: "date", nullable: true),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuotes", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseSupplierQuotes_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_PurchaseSupplierQuotes_TenantId_Id_PurchaseRequestId", x => new { x.TenantId, x.Id, x.PurchaseRequestId });
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuotes_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuotes_PurchaseRequests_TenantId_PurchaseRequestId",
                        columns: x => new { x.TenantId, x.PurchaseRequestId },
                        principalTable: "PurchaseRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SalesQuotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    QuoteDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ValidUntil = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesQuotes", x => x.Id);
                    table.UniqueConstraint("AK_SalesQuotes_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesQuotes_ValidDateRange", "[ValidUntil] >= [QuoteDate]");
                    table.ForeignKey(
                        name: "FK_SalesQuotes_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesQuotes_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourcePurchaseRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SourceSupplierQuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    OrderDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrders", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseOrders_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_PurchaseOrders_TenantId_Id_SupplierId", x => new { x.TenantId, x.Id, x.SupplierId });
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_PurchaseRequests_TenantId_SourcePurchaseRequestId",
                        columns: x => new { x.TenantId, x.SourcePurchaseRequestId },
                        principalTable: "PurchaseRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_PurchaseSupplierQuotes_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId",
                        columns: x => new { x.TenantId, x.SourceSupplierQuoteId, x.SourcePurchaseRequestId },
                        principalTable: "PurchaseSupplierQuotes",
                        principalColumns: new[] { "TenantId", "Id", "PurchaseRequestId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuoteCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuoteCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldValueRevisions_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseSupplierQuoteCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldValueRevisions_PurchaseSupplierQuotes_TenantId_QuoteId",
                        columns: x => new { x.TenantId, x.QuoteId },
                        principalTable: "PurchaseSupplierQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuoteCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuoteCustomFieldValues", x => new { x.TenantId, x.QuoteId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldValues_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseSupplierQuoteCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldValues_PurchaseSupplierQuotes_TenantId_QuoteId",
                        columns: x => new { x.TenantId, x.QuoteId },
                        principalTable: "PurchaseSupplierQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuoteLines",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestLineNumber = table.Column<int>(type: "int", nullable: false),
                    PurchaseRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    VatPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuoteLines", x => new { x.TenantId, x.QuoteId, x.RequestLineNumber });
                    table.CheckConstraint("CK_PurchaseSupplierQuoteLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                    table.CheckConstraint("CK_PurchaseSupplierQuoteLines_QuantityPositive", "[Quantity] > 0");
                    table.CheckConstraint("CK_PurchaseSupplierQuoteLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteLines_PurchaseRequestLines_TenantId_PurchaseRequestId_RequestLineNumber",
                        columns: x => new { x.TenantId, x.PurchaseRequestId, x.RequestLineNumber },
                        principalTable: "PurchaseRequestLines",
                        principalColumns: new[] { "TenantId", "PurchaseRequestId", "LineNumber" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteLines_PurchaseSupplierQuotes_TenantId_QuoteId_PurchaseRequestId",
                        columns: x => new { x.TenantId, x.QuoteId, x.PurchaseRequestId },
                        principalTable: "PurchaseSupplierQuotes",
                        principalColumns: new[] { "TenantId", "Id", "PurchaseRequestId" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SalesOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    OrderDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesOrders", x => x.Id);
                    table.UniqueConstraint("AK_SalesOrders_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SalesOrders_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrders_SalesQuotes_TenantId_QuoteId",
                        columns: x => new { x.TenantId, x.QuoteId },
                        principalTable: "SalesQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrders_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SalesQuoteCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesQuoteCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SalesQuoteCustomFieldValueRevisions_SalesQuoteCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "SalesQuoteCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesQuoteCustomFieldValueRevisions_SalesQuotes_TenantId_QuoteId",
                        columns: x => new { x.TenantId, x.QuoteId },
                        principalTable: "SalesQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesQuoteCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesQuoteCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesQuoteCustomFieldValues", x => new { x.TenantId, x.QuoteId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_SalesQuoteCustomFieldValues_SalesQuoteCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "SalesQuoteCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesQuoteCustomFieldValues_SalesQuotes_TenantId_QuoteId",
                        columns: x => new { x.TenantId, x.QuoteId },
                        principalTable: "SalesQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SalesQuoteLines",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    VatPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesQuoteLines", x => new { x.TenantId, x.QuoteId, x.LineNumber });
                    table.CheckConstraint("CK_SalesQuoteLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                    table.CheckConstraint("CK_SalesQuoteLines_QuantityPositive", "[Quantity] > 0");
                    table.CheckConstraint("CK_SalesQuoteLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
                    table.ForeignKey(
                        name: "FK_SalesQuoteLines_SalesQuotes_TenantId_QuoteId",
                        columns: x => new { x.TenantId, x.QuoteId },
                        principalTable: "SalesQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesQuoteLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrderCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrderCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderCustomFieldValueRevisions_PurchaseOrderCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseOrderCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderCustomFieldValueRevisions_PurchaseOrders_TenantId_PurchaseOrderId",
                        columns: x => new { x.TenantId, x.PurchaseOrderId },
                        principalTable: "PurchaseOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrderCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrderCustomFieldValues", x => new { x.TenantId, x.PurchaseOrderId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_PurchaseOrderCustomFieldValues_PurchaseOrderCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseOrderCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderCustomFieldValues_PurchaseOrders_TenantId_PurchaseOrderId",
                        columns: x => new { x.TenantId, x.PurchaseOrderId },
                        principalTable: "PurchaseOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrderLines",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    VatPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrderLines", x => new { x.TenantId, x.PurchaseOrderId, x.LineNumber });
                    table.CheckConstraint("CK_PurchaseOrderLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                    table.CheckConstraint("CK_PurchaseOrderLines_QuantityPositive", "[Quantity] > 0");
                    table.CheckConstraint("CK_PurchaseOrderLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
                    table.ForeignKey(
                        name: "FK_PurchaseOrderLines_PurchaseOrders_TenantId_PurchaseOrderId",
                        columns: x => new { x.TenantId, x.PurchaseOrderId },
                        principalTable: "PurchaseOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseReceipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ReceiptDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseReceipts", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseReceipts_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_PurchaseReceipts_TenantId_Id_PurchaseOrderId", x => new { x.TenantId, x.Id, x.PurchaseOrderId });
                    table.ForeignKey(
                        name: "FK_PurchaseReceipts_PurchaseOrders_TenantId_PurchaseOrderId",
                        columns: x => new { x.TenantId, x.PurchaseOrderId },
                        principalTable: "PurchaseOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseReceipts_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PurchaseReceipts_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesDeliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    DeliveryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesDeliveries", x => x.Id);
                    table.UniqueConstraint("AK_SalesDeliveries_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_SalesDeliveries_TenantId_Id_OrderId", x => new { x.TenantId, x.Id, x.OrderId });
                    table.ForeignKey(
                        name: "FK_SalesDeliveries_SalesOrders_TenantId_OrderId",
                        columns: x => new { x.TenantId, x.OrderId },
                        principalTable: "SalesOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesDeliveries_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesDeliveries_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesOrderCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesOrderCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SalesOrderCustomFieldValueRevisions_SalesOrderCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "SalesOrderCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrderCustomFieldValueRevisions_SalesOrders_TenantId_OrderId",
                        columns: x => new { x.TenantId, x.OrderId },
                        principalTable: "SalesOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrderCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesOrderCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesOrderCustomFieldValues", x => new { x.TenantId, x.OrderId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_SalesOrderCustomFieldValues_SalesOrderCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "SalesOrderCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrderCustomFieldValues_SalesOrders_TenantId_OrderId",
                        columns: x => new { x.TenantId, x.OrderId },
                        principalTable: "SalesOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SalesOrderLines",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    VatPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesOrderLines", x => new { x.TenantId, x.OrderId, x.LineNumber });
                    table.CheckConstraint("CK_SalesOrderLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                    table.CheckConstraint("CK_SalesOrderLines_QuantityPositive", "[Quantity] > 0");
                    table.CheckConstraint("CK_SalesOrderLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
                    table.ForeignKey(
                        name: "FK_SalesOrderLines_SalesOrders_TenantId_OrderId",
                        columns: x => new { x.TenantId, x.OrderId },
                        principalTable: "SalesOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesOrderLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryCostAdjustments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    EntryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    PurchaseReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    ReversalOfId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryCostAdjustments", x => x.Id);
                    table.UniqueConstraint("AK_InventoryCostAdjustments_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustments_InventoryCostAdjustments_TenantId_ReversalOfId",
                        columns: x => new { x.TenantId, x.ReversalOfId },
                        principalTable: "InventoryCostAdjustments",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustments_PurchaseReceipts_TenantId_PurchaseReceiptId",
                        columns: x => new { x.TenantId, x.PurchaseReceiptId },
                        principalTable: "PurchaseReceipts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustments_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseInvoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    InvoiceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseInvoices", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseInvoices_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_PurchaseInvoices_TenantId_Id_SupplierId", x => new { x.TenantId, x.Id, x.SupplierId });
                    table.CheckConstraint("CK_PurchaseInvoices_GrandTotalPositive", "[GrandTotal] > 0");
                    table.ForeignKey(
                        name: "FK_PurchaseInvoices_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseInvoices_PurchaseOrders_TenantId_PurchaseOrderId_SupplierId",
                        columns: x => new { x.TenantId, x.PurchaseOrderId, x.SupplierId },
                        principalTable: "PurchaseOrders",
                        principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseInvoices_PurchaseReceipts_TenantId_PurchaseReceiptId_PurchaseOrderId",
                        columns: x => new { x.TenantId, x.PurchaseReceiptId, x.PurchaseOrderId },
                        principalTable: "PurchaseReceipts",
                        principalColumns: new[] { "TenantId", "Id", "PurchaseOrderId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseInvoices_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseReceiptCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseReceiptCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptCustomFieldValueRevisions_PurchaseReceiptCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseReceiptCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptCustomFieldValueRevisions_PurchaseReceipts_TenantId_ReceiptId",
                        columns: x => new { x.TenantId, x.ReceiptId },
                        principalTable: "PurchaseReceipts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseReceiptCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseReceiptCustomFieldValues", x => new { x.TenantId, x.ReceiptId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptCustomFieldValues_PurchaseReceiptCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseReceiptCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptCustomFieldValues_PurchaseReceipts_TenantId_ReceiptId",
                        columns: x => new { x.TenantId, x.ReceiptId },
                        principalTable: "PurchaseReceipts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseReceiptLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    EnteredQuantity = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    EnteredUnitCode = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseReceiptLines", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseReceiptLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_PurchaseReceiptLines_TenantId_ReceiptId_Id", x => new { x.TenantId, x.ReceiptId, x.Id });
                    table.CheckConstraint("CK_PurchaseReceiptLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptLines_PurchaseOrderLines_TenantId_PurchaseOrderId_OrderLineNumber",
                        columns: x => new { x.TenantId, x.PurchaseOrderId, x.OrderLineNumber },
                        principalTable: "PurchaseOrderLines",
                        principalColumns: new[] { "TenantId", "PurchaseOrderId", "LineNumber" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptLines_PurchaseReceipts_TenantId_ReceiptId_PurchaseOrderId",
                        columns: x => new { x.TenantId, x.ReceiptId, x.PurchaseOrderId },
                        principalTable: "PurchaseReceipts",
                        principalColumns: new[] { "TenantId", "Id", "PurchaseOrderId" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SalesInvoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeliveryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    InvoiceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesInvoices", x => x.Id);
                    table.UniqueConstraint("AK_SalesInvoices_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SalesInvoices_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesInvoices_SalesDeliveries_TenantId_DeliveryId",
                        columns: x => new { x.TenantId, x.DeliveryId },
                        principalTable: "SalesDeliveries",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesInvoices_SalesOrders_TenantId_OrderId",
                        columns: x => new { x.TenantId, x.OrderId },
                        principalTable: "SalesOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesInvoices_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SalesOrderReservations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    FulfilledQuantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReleasedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesOrderReservations", x => x.Id);
                    table.UniqueConstraint("AK_SalesOrderReservations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_SalesOrderReservations_TenantId_Id_OrderId_OrderLineNumber", x => new { x.TenantId, x.Id, x.OrderId, x.OrderLineNumber });
                    table.CheckConstraint("CK_SalesOrderReservations_FulfilledRange", "[FulfilledQuantity] >= 0 AND [FulfilledQuantity] <= [Quantity]");
                    table.CheckConstraint("CK_SalesOrderReservations_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_SalesOrderReservations_SalesOrderLines_TenantId_OrderId_OrderLineNumber",
                        columns: x => new { x.TenantId, x.OrderId, x.OrderLineNumber },
                        principalTable: "SalesOrderLines",
                        principalColumns: new[] { "TenantId", "OrderId", "LineNumber" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrderReservations_SalesOrders_TenantId_OrderId",
                        columns: x => new { x.TenantId, x.OrderId },
                        principalTable: "SalesOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrderReservations_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrderReservations_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SupplierPayments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    PaymentDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PaymentMethod = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    FinancialAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierPayments", x => x.Id);
                    table.UniqueConstraint("AK_SupplierPayments_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_SupplierPayments_TenantId_Id_CurrencyCode", x => new { x.TenantId, x.Id, x.CurrencyCode });
                    table.UniqueConstraint("AK_SupplierPayments_TenantId_Id_SupplierId", x => new { x.TenantId, x.Id, x.SupplierId });
                    table.CheckConstraint("CK_SupplierPayments_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_SupplierPayments_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierPayments_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.FinancialAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierPayments_PurchaseInvoices_TenantId_PurchaseInvoiceId_SupplierId",
                        columns: x => new { x.TenantId, x.PurchaseInvoiceId, x.SupplierId },
                        principalTable: "PurchaseInvoices",
                        principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierPayments_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SupplierReturns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ReturnDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierReturns", x => x.Id);
                    table.UniqueConstraint("AK_SupplierReturns_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_SupplierReturns_TenantId_Id_PurchaseInvoiceId", x => new { x.TenantId, x.Id, x.PurchaseInvoiceId });
                    table.UniqueConstraint("AK_SupplierReturns_TenantId_Id_SupplierId", x => new { x.TenantId, x.Id, x.SupplierId });
                    table.CheckConstraint("CK_SupplierReturns_GrandTotalPositive", "[GrandTotal] > 0");
                    table.ForeignKey(
                        name: "FK_SupplierReturns_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierReturns_PurchaseInvoices_TenantId_PurchaseInvoiceId_SupplierId",
                        columns: x => new { x.TenantId, x.PurchaseInvoiceId, x.SupplierId },
                        principalTable: "PurchaseInvoices",
                        principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierReturns_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SupplierReturns_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryCostAdjustmentLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AdjustmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseReceiptLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    QuantitySnapshot = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitCostSnapshotBase = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: true),
                    AmountBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryCostAdjustmentLines", x => x.Id);
                    table.UniqueConstraint("AK_InventoryCostAdjustmentLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_InventoryCostAdjustmentLines_AmountNonZero", "[AmountBase] <> 0");
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustmentLines_InventoryCostAdjustments_TenantId_AdjustmentId",
                        columns: x => new { x.TenantId, x.AdjustmentId },
                        principalTable: "InventoryCostAdjustments",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustmentLines_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId",
                        columns: x => new { x.TenantId, x.PurchaseReceiptLineId },
                        principalTable: "PurchaseReceiptLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustmentLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustmentLines_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseInvoiceLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseReceiptLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    VatPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseInvoiceLines", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseInvoiceLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId_Id", x => new { x.TenantId, x.PurchaseInvoiceId, x.Id });
                    table.CheckConstraint("CK_PurchaseInvoiceLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_PurchaseInvoiceLines_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                        columns: x => new { x.TenantId, x.PurchaseInvoiceId },
                        principalTable: "PurchaseInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PurchaseInvoiceLines_PurchaseReceiptLines_TenantId_PurchaseReceiptId_PurchaseReceiptLineId",
                        columns: x => new { x.TenantId, x.PurchaseReceiptId, x.PurchaseReceiptLineId },
                        principalTable: "PurchaseReceiptLines",
                        principalColumns: new[] { "TenantId", "ReceiptId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CustomerCollectionAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerCollectionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerCollectionAllocations", x => x.Id);
                    table.UniqueConstraint("AK_CustomerCollectionAllocations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CustomerCollectionAllocations_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_CustomerCollectionAllocations_CustomerCollections_TenantId_CustomerCollectionId",
                        columns: x => new { x.TenantId, x.CustomerCollectionId },
                        principalTable: "CustomerCollections",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CustomerCollectionAllocations_SalesInvoices_TenantId_SalesInvoiceId",
                        columns: x => new { x.TenantId, x.SalesInvoiceId },
                        principalTable: "SalesInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesInvoiceCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesInvoiceCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SalesInvoiceCustomFieldValueRevisions_SalesInvoiceCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "SalesInvoiceCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesInvoiceCustomFieldValueRevisions_SalesInvoices_TenantId_InvoiceId",
                        columns: x => new { x.TenantId, x.InvoiceId },
                        principalTable: "SalesInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesInvoiceCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesInvoiceCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesInvoiceCustomFieldValues", x => new { x.TenantId, x.InvoiceId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_SalesInvoiceCustomFieldValues_SalesInvoiceCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "SalesInvoiceCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesInvoiceCustomFieldValues_SalesInvoices_TenantId_InvoiceId",
                        columns: x => new { x.TenantId, x.InvoiceId },
                        principalTable: "SalesInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SalesReturns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ReturnDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesReturns", x => x.Id);
                    table.UniqueConstraint("AK_SalesReturns_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesReturns_GrandTotalPositive", "[GrandTotal] > 0");
                    table.ForeignKey(
                        name: "FK_SalesReturns_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesReturns_SalesInvoices_TenantId_SalesInvoiceId",
                        columns: x => new { x.TenantId, x.SalesInvoiceId },
                        principalTable: "SalesInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesReturns_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesReturns_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesDeliveryLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeliveryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    ReservationId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    EnteredQuantity = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    EnteredUnitCode = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesDeliveryLines", x => x.Id);
                    table.UniqueConstraint("AK_SalesDeliveryLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesDeliveryLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId_OrderId",
                        columns: x => new { x.TenantId, x.DeliveryId, x.OrderId },
                        principalTable: "SalesDeliveries",
                        principalColumns: new[] { "TenantId", "Id", "OrderId" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesDeliveryLines_SalesOrderLines_TenantId_OrderId_OrderLineNumber",
                        columns: x => new { x.TenantId, x.OrderId, x.OrderLineNumber },
                        principalTable: "SalesOrderLines",
                        principalColumns: new[] { "TenantId", "OrderId", "LineNumber" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesDeliveryLines_SalesOrderReservations_TenantId_ReservationId_OrderId_OrderLineNumber",
                        columns: x => new { x.TenantId, x.ReservationId, x.OrderId, x.OrderLineNumber },
                        principalTable: "SalesOrderReservations",
                        principalColumns: new[] { "TenantId", "Id", "OrderId", "OrderLineNumber" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FinancialAccountTransactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FinancialAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    TransactionDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReversalOfId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CustomerCollectionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SupplierPaymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TransferId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinancialAccountTransactions", x => x.Id);
                    table.UniqueConstraint("AK_FinancialAccountTransactions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_FinancialAccountTransactions_TenantId_Id_FinancialAccountId_CurrencyCode", x => new { x.TenantId, x.Id, x.FinancialAccountId, x.CurrencyCode });
                    table.CheckConstraint("CK_FinancialAccountTransactions_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransactions_CustomerCollections_TenantId_CustomerCollectionId_CurrencyCode",
                        columns: x => new { x.TenantId, x.CustomerCollectionId, x.CurrencyCode },
                        principalTable: "CustomerCollections",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransactions_FinancialAccountTransactions_TenantId_ReversalOfId",
                        columns: x => new { x.TenantId, x.ReversalOfId },
                        principalTable: "FinancialAccountTransactions",
                        principalColumns: new[] { "TenantId", "Id" });
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransactions_FinancialAccountTransfers_TenantId_TransferId",
                        columns: x => new { x.TenantId, x.TransferId },
                        principalTable: "FinancialAccountTransfers",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransactions_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.FinancialAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransactions_SupplierPayments_TenantId_SupplierPaymentId_CurrencyCode",
                        columns: x => new { x.TenantId, x.SupplierPaymentId, x.CurrencyCode },
                        principalTable: "SupplierPayments",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SupplierReturnLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierReturnId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    EnteredQuantity = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    EnteredUnitCode = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    VatPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierReturnLines", x => x.Id);
                    table.UniqueConstraint("AK_SupplierReturnLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SupplierReturnLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_SupplierReturnLines_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId_PurchaseInvoiceLineId",
                        columns: x => new { x.TenantId, x.PurchaseInvoiceId, x.PurchaseInvoiceLineId },
                        principalTable: "PurchaseInvoiceLines",
                        principalColumns: new[] { "TenantId", "PurchaseInvoiceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierReturnLines_SupplierReturns_TenantId_SupplierReturnId_PurchaseInvoiceId",
                        columns: x => new { x.TenantId, x.SupplierReturnId, x.PurchaseInvoiceId },
                        principalTable: "SupplierReturns",
                        principalColumns: new[] { "TenantId", "Id", "PurchaseInvoiceId" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CustomerLedgerEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EntryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReversalOfId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SalesInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CustomerCollectionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SalesReturnId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PurchaseInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SupplierPaymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SupplierReturnId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerLedgerEntries", x => x.Id);
                    table.UniqueConstraint("AK_CustomerLedgerEntries_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CustomerLedgerEntries_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_CustomerLedgerEntries_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CustomerLedgerEntries_CustomerCollections_TenantId_CustomerCollectionId",
                        columns: x => new { x.TenantId, x.CustomerCollectionId },
                        principalTable: "CustomerCollections",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerLedgerEntries_CustomerLedgerEntries_TenantId_ReversalOfId",
                        columns: x => new { x.TenantId, x.ReversalOfId },
                        principalTable: "CustomerLedgerEntries",
                        principalColumns: new[] { "TenantId", "Id" });
                    table.ForeignKey(
                        name: "FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId_CustomerId",
                        columns: x => new { x.TenantId, x.PurchaseInvoiceId, x.CustomerId },
                        principalTable: "PurchaseInvoices",
                        principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerLedgerEntries_SalesInvoices_TenantId_SalesInvoiceId",
                        columns: x => new { x.TenantId, x.SalesInvoiceId },
                        principalTable: "SalesInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerLedgerEntries_SalesReturns_TenantId_SalesReturnId",
                        columns: x => new { x.TenantId, x.SalesReturnId },
                        principalTable: "SalesReturns",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId_CustomerId",
                        columns: x => new { x.TenantId, x.SupplierPaymentId, x.CustomerId },
                        principalTable: "SupplierPayments",
                        principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerLedgerEntries_SupplierReturns_TenantId_SupplierReturnId_CustomerId",
                        columns: x => new { x.TenantId, x.SupplierReturnId, x.CustomerId },
                        principalTable: "SupplierReturns",
                        principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesInvoiceLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeliveryLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    VatPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesInvoiceLines", x => x.Id);
                    table.UniqueConstraint("AK_SalesInvoiceLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesInvoiceLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                    table.CheckConstraint("CK_SalesInvoiceLines_QuantityPositive", "[Quantity] > 0");
                    table.CheckConstraint("CK_SalesInvoiceLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
                    table.ForeignKey(
                        name: "FK_SalesInvoiceLines_SalesDeliveryLines_TenantId_DeliveryLineId",
                        columns: x => new { x.TenantId, x.DeliveryLineId },
                        principalTable: "SalesDeliveryLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesInvoiceLines_SalesInvoices_TenantId_InvoiceId",
                        columns: x => new { x.TenantId, x.InvoiceId },
                        principalTable: "SalesInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesInvoiceLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BankStatementLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StatementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FinancialAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    ExternalId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    TransactionDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    FinancialAccountTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsBookEntryCreated = table.Column<bool>(type: "bit", nullable: false),
                    MatchedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankStatementLines", x => x.Id);
                    table.UniqueConstraint("AK_BankStatementLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_BankStatementLines_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_BankStatementLines_BankStatements_TenantId_StatementId_FinancialAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.StatementId, x.FinancialAccountId, x.CurrencyCode },
                        principalTable: "BankStatements",
                        principalColumns: new[] { "TenantId", "Id", "AccountId", "CurrencyCode" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BankStatementLines_FinancialAccountTransactions_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.FinancialAccountTransactionId, x.FinancialAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccountTransactions",
                        principalColumns: new[] { "TenantId", "Id", "FinancialAccountId", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesReturnLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesReturnId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesInvoiceLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    EnteredQuantity = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    EnteredUnitCode = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    VatPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesReturnLines", x => x.Id);
                    table.UniqueConstraint("AK_SalesReturnLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesReturnLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                    table.CheckConstraint("CK_SalesReturnLines_QuantityPositive", "[Quantity] > 0");
                    table.CheckConstraint("CK_SalesReturnLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
                    table.ForeignKey(
                        name: "FK_SalesReturnLines_SalesInvoiceLines_TenantId_SalesInvoiceLineId",
                        columns: x => new { x.TenantId, x.SalesInvoiceLineId },
                        principalTable: "SalesInvoiceLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesReturnLines_SalesReturns_TenantId_SalesReturnId",
                        columns: x => new { x.TenantId, x.SalesReturnId },
                        principalTable: "SalesReturns",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesReturnLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryTransactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EntryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    EnteredQuantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: true),
                    EnteredUnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    UnitCostBase = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReversalOfId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SalesDeliveryLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SalesReturnLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PurchaseReceiptLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SupplierReturnLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    InventoryTransferId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryTransactions", x => x.Id);
                    table.UniqueConstraint("AK_InventoryTransactions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_InventoryTransactions_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_InventoryTransactions_InventoryTransactions_TenantId_ReversalOfId",
                        columns: x => new { x.TenantId, x.ReversalOfId },
                        principalTable: "InventoryTransactions",
                        principalColumns: new[] { "TenantId", "Id" });
                    table.ForeignKey(
                        name: "FK_InventoryTransactions_InventoryTransfers_TenantId_InventoryTransferId",
                        columns: x => new { x.TenantId, x.InventoryTransferId },
                        principalTable: "InventoryTransfers",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransactions_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId",
                        columns: x => new { x.TenantId, x.PurchaseReceiptLineId },
                        principalTable: "PurchaseReceiptLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransactions_SalesDeliveryLines_TenantId_SalesDeliveryLineId",
                        columns: x => new { x.TenantId, x.SalesDeliveryLineId },
                        principalTable: "SalesDeliveryLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransactions_SalesReturnLines_TenantId_SalesReturnLineId",
                        columns: x => new { x.TenantId, x.SalesReturnLineId },
                        principalTable: "SalesReturnLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransactions_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransactions_SupplierReturnLines_TenantId_SupplierReturnLineId",
                        columns: x => new { x.TenantId, x.SupplierReturnLineId },
                        principalTable: "SupplierReturnLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransactions_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryTransactionTraces",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InventoryTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TrackingMode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    TrackingCode = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryTransactionTraces", x => x.Id);
                    table.CheckConstraint("CK_InventoryTransactionTraces_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_InventoryTransactionTraces_InventoryTransactions_TenantId_InventoryTransactionId",
                        columns: x => new { x.TenantId, x.InventoryTransactionId },
                        principalTable: "InventoryTransactions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransactionTraces_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEvents_TenantId_OccurredAt",
                table: "AuditEvents",
                columns: new[] { "TenantId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_TenantId_FinancialAccountTransactionId",
                table: "BankStatementLines",
                columns: new[] { "TenantId", "FinancialAccountTransactionId" },
                unique: true,
                filter: "[FinancialAccountTransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode",
                table: "BankStatementLines",
                columns: new[] { "TenantId", "FinancialAccountTransactionId", "FinancialAccountId", "CurrencyCode" },
                unique: true,
                filter: "[FinancialAccountTransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_TenantId_StatementId_ExternalId",
                table: "BankStatementLines",
                columns: new[] { "TenantId", "StatementId", "ExternalId" },
                unique: true,
                filter: "[ExternalId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_TenantId_StatementId_FinancialAccountId_CurrencyCode",
                table: "BankStatementLines",
                columns: new[] { "TenantId", "StatementId", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_TenantId_StatementId_LineNumber",
                table: "BankStatementLines",
                columns: new[] { "TenantId", "StatementId", "LineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BankStatements_TenantId_AccountId_CurrencyCode",
                table: "BankStatements",
                columns: new[] { "TenantId", "AccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_BankStatements_TenantId_Code",
                table: "BankStatements",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BankStatements_TenantId_RequestId",
                table: "BankStatements",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerAccounts_TenantId_Code",
                table: "CustomerAccounts",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerAccounts_TenantId_GroupId",
                table: "CustomerAccounts",
                columns: new[] { "TenantId", "GroupId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerAccounts_TenantId_Name",
                table: "CustomerAccounts",
                columns: new[] { "TenantId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerAddresses_TenantId_CustomerId",
                table: "CustomerAddresses",
                columns: new[] { "TenantId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollectionAllocations_TenantId_CustomerCollectionId_SalesInvoiceId",
                table: "CustomerCollectionAllocations",
                columns: new[] { "TenantId", "CustomerCollectionId", "SalesInvoiceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollectionAllocations_TenantId_SalesInvoiceId",
                table: "CustomerCollectionAllocations",
                columns: new[] { "TenantId", "SalesInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollections_TenantId_Code",
                table: "CustomerCollections",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollections_TenantId_CustomerId_CollectionDate_CreatedAt",
                table: "CustomerCollections",
                columns: new[] { "TenantId", "CustomerId", "CollectionDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollections_TenantId_FinancialAccountId_CurrencyCode",
                table: "CustomerCollections",
                columns: new[] { "TenantId", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollections_TenantId_RequestId",
                table: "CustomerCollections",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "CustomerCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCustomFieldDefinitions_TenantId_Code",
                table: "CustomerCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCustomFieldValueRevisions_TenantId_CustomerId_DefinitionId_CreatedAt",
                table: "CustomerCustomFieldValueRevisions",
                columns: new[] { "TenantId", "CustomerId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "CustomerCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCustomFieldValues_TenantId_DefinitionId",
                table: "CustomerCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerGroups_TenantId_Code",
                table: "CustomerGroups",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_CustomerCollectionId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "CustomerCollectionId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_CustomerId_EntryDate_CreatedAt",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "CustomerId", "EntryDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "PurchaseInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_ReversalOfId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "ReversalOfId" },
                unique: true,
                filter: "[ReversalOfId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SalesInvoiceId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SalesInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SalesReturnId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SalesReturnId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierPaymentId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierPaymentId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierPaymentId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierPaymentId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierReturnId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierReturnId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierReturnId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierReturnId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccounts_TenantId_Code",
                table: "FinancialAccounts",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_CustomerCollectionId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "CustomerCollectionId" },
                unique: true,
                filter: "[CustomerCollectionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_CustomerCollectionId_CurrencyCode",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "CustomerCollectionId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_FinancialAccountId_CurrencyCode",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_FinancialAccountId_TransactionDate_CreatedAt",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "FinancialAccountId", "TransactionDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_RequestId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "RequestId" },
                unique: true,
                filter: "[RequestId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_ReversalOfId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "ReversalOfId" },
                unique: true,
                filter: "[ReversalOfId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_SupplierPaymentId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "SupplierPaymentId" },
                unique: true,
                filter: "[SupplierPaymentId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_SupplierPaymentId_CurrencyCode",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "SupplierPaymentId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_TransferId_FinancialAccountId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "TransferId", "FinancialAccountId" },
                unique: true,
                filter: "[TransferId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransfers_TenantId_Code",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransfers_TenantId_FromAccountId_CurrencyCode",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "FromAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransfers_TenantId_RequestId",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransfers_TenantId_ToAccountId_ToCurrencyCode",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "ToAccountId", "ToCurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_FxRevaluationVoucherLines_TenantId_VoucherId_InvoiceId",
                table: "FxRevaluationVoucherLines",
                columns: new[] { "TenantId", "VoucherId", "InvoiceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FxRevaluationVouchers_TenantId_AsOfDate",
                table: "FxRevaluationVouchers",
                columns: new[] { "TenantId", "AsOfDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FxRevaluationVouchers_TenantId_Code",
                table: "FxRevaluationVouchers",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustmentLines_TenantId_AdjustmentId_WarehouseId_StockItemId",
                table: "InventoryCostAdjustmentLines",
                columns: new[] { "TenantId", "AdjustmentId", "WarehouseId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustmentLines_TenantId_PurchaseReceiptLineId",
                table: "InventoryCostAdjustmentLines",
                columns: new[] { "TenantId", "PurchaseReceiptLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustmentLines_TenantId_StockItemId",
                table: "InventoryCostAdjustmentLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustmentLines_TenantId_WarehouseId",
                table: "InventoryCostAdjustmentLines",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustments_TenantId_Code",
                table: "InventoryCostAdjustments",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustments_TenantId_EntryDate_CreatedAt",
                table: "InventoryCostAdjustments",
                columns: new[] { "TenantId", "EntryDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustments_TenantId_PurchaseReceiptId",
                table: "InventoryCostAdjustments",
                columns: new[] { "TenantId", "PurchaseReceiptId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustments_TenantId_ReversalOfId",
                table: "InventoryCostAdjustments",
                columns: new[] { "TenantId", "ReversalOfId" },
                unique: true,
                filter: "[ReversalOfId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_InventoryTransferId_WarehouseId_StockItemId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "InventoryTransferId", "WarehouseId", "StockItemId" },
                unique: true,
                filter: "[InventoryTransferId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_PurchaseReceiptLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "PurchaseReceiptLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_ReversalOfId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "ReversalOfId" },
                unique: true,
                filter: "[ReversalOfId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_SalesDeliveryLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "SalesDeliveryLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_SalesReturnLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "SalesReturnLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_StockItemId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_SupplierReturnLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "SupplierReturnLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_WarehouseId_StockItemId_EntryDate_CreatedAt",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "WarehouseId", "StockItemId", "EntryDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactionTraces_TenantId_InventoryTransactionId",
                table: "InventoryTransactionTraces",
                columns: new[] { "TenantId", "InventoryTransactionId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactionTraces_TenantId_StockItemId_TrackingCode",
                table: "InventoryTransactionTraces",
                columns: new[] { "TenantId", "StockItemId", "TrackingCode" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransfers_TenantId_Code",
                table: "InventoryTransfers",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransfers_TenantId_FromWarehouseId",
                table: "InventoryTransfers",
                columns: new[] { "TenantId", "FromWarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransfers_TenantId_RequestId",
                table: "InventoryTransfers",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransfers_TenantId_ToWarehouseId",
                table: "InventoryTransfers",
                columns: new[] { "TenantId", "ToWarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransfers_TenantId_TransferDate_CreatedAt",
                table: "InventoryTransfers",
                columns: new[] { "TenantId", "TransferDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId",
                table: "PurchaseInvoiceLines",
                columns: new[] { "TenantId", "PurchaseInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoiceLines_TenantId_PurchaseReceiptId_PurchaseReceiptLineId",
                table: "PurchaseInvoiceLines",
                columns: new[] { "TenantId", "PurchaseReceiptId", "PurchaseReceiptLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_TenantId_Code",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_TenantId_PurchaseOrderId_SupplierId",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "PurchaseOrderId", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_TenantId_PurchaseReceiptId",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "PurchaseReceiptId" },
                unique: true,
                filter: "[Status] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_TenantId_PurchaseReceiptId_PurchaseOrderId",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "PurchaseReceiptId", "PurchaseOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_TenantId_SupplierId_InvoiceDate_CreatedAt",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "SupplierId", "InvoiceDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "PurchaseOrderCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderCustomFieldDefinitions_TenantId_Code",
                table: "PurchaseOrderCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "PurchaseOrderCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderCustomFieldValueRevisions_TenantId_PurchaseOrderId_DefinitionId_CreatedAt",
                table: "PurchaseOrderCustomFieldValueRevisions",
                columns: new[] { "TenantId", "PurchaseOrderId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderCustomFieldValues_TenantId_DefinitionId",
                table: "PurchaseOrderCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderLines_TenantId_StockItemId",
                table: "PurchaseOrderLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_Code",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_OrderDate_CreatedAt",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "OrderDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_SourcePurchaseRequestId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourcePurchaseRequestId" },
                unique: true,
                filter: "[SourcePurchaseRequestId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_SourceSupplierQuoteId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourceSupplierQuoteId" },
                unique: true,
                filter: "[SourceSupplierQuoteId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourceSupplierQuoteId", "SourcePurchaseRequestId" },
                unique: true,
                filter: "[SourceSupplierQuoteId] IS NOT NULL AND [SourcePurchaseRequestId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_SupplierId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceiptCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "PurchaseReceiptCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceiptCustomFieldDefinitions_TenantId_Code",
                table: "PurchaseReceiptCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceiptCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "PurchaseReceiptCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceiptCustomFieldValueRevisions_TenantId_ReceiptId_DefinitionId_CreatedAt",
                table: "PurchaseReceiptCustomFieldValueRevisions",
                columns: new[] { "TenantId", "ReceiptId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceiptCustomFieldValues_TenantId_DefinitionId",
                table: "PurchaseReceiptCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceiptLines_TenantId_PurchaseOrderId_OrderLineNumber",
                table: "PurchaseReceiptLines",
                columns: new[] { "TenantId", "PurchaseOrderId", "OrderLineNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceiptLines_TenantId_ReceiptId_OrderLineNumber",
                table: "PurchaseReceiptLines",
                columns: new[] { "TenantId", "ReceiptId", "OrderLineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceiptLines_TenantId_ReceiptId_PurchaseOrderId",
                table: "PurchaseReceiptLines",
                columns: new[] { "TenantId", "ReceiptId", "PurchaseOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceipts_TenantId_Code",
                table: "PurchaseReceipts",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceipts_TenantId_PurchaseOrderId_Status_ReceiptDate",
                table: "PurchaseReceipts",
                columns: new[] { "TenantId", "PurchaseOrderId", "Status", "ReceiptDate" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceipts_TenantId_RequestId",
                table: "PurchaseReceipts",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceipts_TenantId_WarehouseId",
                table: "PurchaseReceipts",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseRequestCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "PurchaseRequestCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseRequestCustomFieldDefinitions_TenantId_Code",
                table: "PurchaseRequestCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseRequestCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "PurchaseRequestCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseRequestCustomFieldValueRevisions_TenantId_PurchaseRequestId_DefinitionId_CreatedAt",
                table: "PurchaseRequestCustomFieldValueRevisions",
                columns: new[] { "TenantId", "PurchaseRequestId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseRequestCustomFieldValues_PurchaseRequestId",
                table: "PurchaseRequestCustomFieldValues",
                column: "PurchaseRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseRequestCustomFieldValues_TenantId_DefinitionId",
                table: "PurchaseRequestCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseRequestLines_TenantId_StockItemId",
                table: "PurchaseRequestLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseRequests_TenantId_Code",
                table: "PurchaseRequests",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseRequests_TenantId_Status_CreatedAt",
                table: "PurchaseRequests",
                columns: new[] { "TenantId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "PurchaseSupplierQuoteCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_Code",
                table: "PurchaseSupplierQuoteCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "PurchaseSupplierQuoteCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteCustomFieldValueRevisions_TenantId_QuoteId_DefinitionId_CreatedAt",
                table: "PurchaseSupplierQuoteCustomFieldValueRevisions",
                columns: new[] { "TenantId", "QuoteId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteCustomFieldValues_TenantId_DefinitionId",
                table: "PurchaseSupplierQuoteCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteLines_TenantId_PurchaseRequestId_RequestLineNumber",
                table: "PurchaseSupplierQuoteLines",
                columns: new[] { "TenantId", "PurchaseRequestId", "RequestLineNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteLines_TenantId_QuoteId_PurchaseRequestId",
                table: "PurchaseSupplierQuoteLines",
                columns: new[] { "TenantId", "QuoteId", "PurchaseRequestId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuotes_TenantId_PurchaseRequestId_Status_CreatedAt",
                table: "PurchaseSupplierQuotes",
                columns: new[] { "TenantId", "PurchaseRequestId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuotes_TenantId_SupplierId_Code",
                table: "PurchaseSupplierQuotes",
                columns: new[] { "TenantId", "SupplierId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveries_TenantId_Code",
                table: "SalesDeliveries",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveries_TenantId_OrderId_Status_DeliveryDate",
                table: "SalesDeliveries",
                columns: new[] { "TenantId", "OrderId", "Status", "DeliveryDate" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveries_TenantId_RequestId",
                table: "SalesDeliveries",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveries_TenantId_WarehouseId",
                table: "SalesDeliveries",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveryLines_TenantId_DeliveryId_OrderId",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId", "OrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveryLines_TenantId_DeliveryId_OrderLineNumber",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId", "OrderLineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveryLines_TenantId_OrderId_OrderLineNumber",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "OrderId", "OrderLineNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveryLines_TenantId_ReservationId_OrderId_OrderLineNumber",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "ReservationId", "OrderId", "OrderLineNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "SalesInvoiceCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceCustomFieldDefinitions_TenantId_Code",
                table: "SalesInvoiceCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "SalesInvoiceCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceCustomFieldValueRevisions_TenantId_InvoiceId_DefinitionId_CreatedAt",
                table: "SalesInvoiceCustomFieldValueRevisions",
                columns: new[] { "TenantId", "InvoiceId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceCustomFieldValues_TenantId_DefinitionId",
                table: "SalesInvoiceCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceLines_TenantId_DeliveryLineId",
                table: "SalesInvoiceLines",
                columns: new[] { "TenantId", "DeliveryLineId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceLines_TenantId_InvoiceId",
                table: "SalesInvoiceLines",
                columns: new[] { "TenantId", "InvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceLines_TenantId_StockItemId",
                table: "SalesInvoiceLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_TenantId_Code",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_TenantId_CustomerId",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_TenantId_DeliveryId",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "DeliveryId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_TenantId_InvoiceDate_CreatedAt",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "InvoiceDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_TenantId_OrderId",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "OrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "SalesOrderCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderCustomFieldDefinitions_TenantId_Code",
                table: "SalesOrderCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "SalesOrderCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderCustomFieldValueRevisions_TenantId_OrderId_DefinitionId_CreatedAt",
                table: "SalesOrderCustomFieldValueRevisions",
                columns: new[] { "TenantId", "OrderId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderCustomFieldValues_TenantId_DefinitionId",
                table: "SalesOrderCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderLines_TenantId_StockItemId",
                table: "SalesOrderLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderReservations_TenantId_OrderId_OrderLineNumber",
                table: "SalesOrderReservations",
                columns: new[] { "TenantId", "OrderId", "OrderLineNumber" },
                unique: true,
                filter: "[Status] = N'Active'");

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderReservations_TenantId_RequestId_OrderId_OrderLineNumber",
                table: "SalesOrderReservations",
                columns: new[] { "TenantId", "RequestId", "OrderId", "OrderLineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderReservations_TenantId_WarehouseId_Status",
                table: "SalesOrderReservations",
                columns: new[] { "TenantId", "WarehouseId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrders_TenantId_Code",
                table: "SalesOrders",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrders_TenantId_CustomerId",
                table: "SalesOrders",
                columns: new[] { "TenantId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrders_TenantId_OrderDate_CreatedAt",
                table: "SalesOrders",
                columns: new[] { "TenantId", "OrderDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrders_TenantId_QuoteId",
                table: "SalesOrders",
                columns: new[] { "TenantId", "QuoteId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuoteCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "SalesQuoteCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuoteCustomFieldDefinitions_TenantId_Code",
                table: "SalesQuoteCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuoteCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "SalesQuoteCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuoteCustomFieldValueRevisions_TenantId_QuoteId_DefinitionId_CreatedAt",
                table: "SalesQuoteCustomFieldValueRevisions",
                columns: new[] { "TenantId", "QuoteId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuoteCustomFieldValues_TenantId_DefinitionId",
                table: "SalesQuoteCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuoteLines_TenantId_StockItemId",
                table: "SalesQuoteLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuotes_TenantId_Code",
                table: "SalesQuotes",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuotes_TenantId_CustomerId",
                table: "SalesQuotes",
                columns: new[] { "TenantId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuotes_TenantId_QuoteDate_CreatedAt",
                table: "SalesQuotes",
                columns: new[] { "TenantId", "QuoteDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturnLines_TenantId_SalesInvoiceLineId",
                table: "SalesReturnLines",
                columns: new[] { "TenantId", "SalesInvoiceLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturnLines_TenantId_SalesReturnId",
                table: "SalesReturnLines",
                columns: new[] { "TenantId", "SalesReturnId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturnLines_TenantId_StockItemId",
                table: "SalesReturnLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturns_TenantId_Code",
                table: "SalesReturns",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturns_TenantId_CustomerId",
                table: "SalesReturns",
                columns: new[] { "TenantId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturns_TenantId_RequestId",
                table: "SalesReturns",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturns_TenantId_SalesInvoiceId_ReturnDate_CreatedAt",
                table: "SalesReturns",
                columns: new[] { "TenantId", "SalesInvoiceId", "ReturnDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturns_TenantId_WarehouseId",
                table: "SalesReturns",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockItemCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "StockItemCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockItemCustomFieldDefinitions_TenantId_Code",
                table: "StockItemCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockItemCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "StockItemCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockItemCustomFieldValueRevisions_TenantId_StockItemId_DefinitionId_CreatedAt",
                table: "StockItemCustomFieldValueRevisions",
                columns: new[] { "TenantId", "StockItemId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StockItemCustomFieldValues_TenantId_DefinitionId",
                table: "StockItemCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockItems_TenantId_Barcode",
                table: "StockItems",
                columns: new[] { "TenantId", "Barcode" },
                unique: true,
                filter: "[Barcode] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StockItems_TenantId_Code",
                table: "StockItems",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockItems_TenantId_Name",
                table: "StockItems",
                columns: new[] { "TenantId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_StockItemUnitConversions_TenantId_StockItemId_UnitCode",
                table: "StockItemUnitConversions",
                columns: new[] { "TenantId", "StockItemId", "UnitCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_Code",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_FinancialAccountId_CurrencyCode",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_PurchaseInvoiceId_Status_PaymentDate",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "Status", "PaymentDate" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_PurchaseInvoiceId_SupplierId",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_RequestId",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_SupplierId",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturnLines_TenantId_PurchaseInvoiceId_PurchaseInvoiceLineId",
                table: "SupplierReturnLines",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "PurchaseInvoiceLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturnLines_TenantId_SupplierReturnId",
                table: "SupplierReturnLines",
                columns: new[] { "TenantId", "SupplierReturnId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturnLines_TenantId_SupplierReturnId_PurchaseInvoiceId",
                table: "SupplierReturnLines",
                columns: new[] { "TenantId", "SupplierReturnId", "PurchaseInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_Code",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_PurchaseInvoiceId_Status_ReturnDate",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "Status", "ReturnDate" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_PurchaseInvoiceId_SupplierId",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_RequestId",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_SupplierId",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_WarehouseId",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantExchangeRates_TenantId_CurrencyCode_RateDate_Revision",
                table: "TenantExchangeRates",
                columns: new[] { "TenantId", "CurrencyCode", "RateDate", "Revision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_Slug",
                table: "Tenants",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "WarehouseCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseCustomFieldDefinitions_TenantId_Code",
                table: "WarehouseCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "WarehouseCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseCustomFieldValueRevisions_TenantId_WarehouseId_DefinitionId_CreatedAt",
                table: "WarehouseCustomFieldValueRevisions",
                columns: new[] { "TenantId", "WarehouseId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseCustomFieldValues_TenantId_DefinitionId",
                table: "WarehouseCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_TenantId_Code",
                table: "Warehouses",
                columns: new[] { "TenantId", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditEvents");

            migrationBuilder.DropTable(
                name: "BankStatementLines");

            migrationBuilder.DropTable(
                name: "CustomerAddresses");

            migrationBuilder.DropTable(
                name: "CustomerCollectionAllocations");

            migrationBuilder.DropTable(
                name: "CustomerCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "CustomerCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "CustomerCustomFieldValues");

            migrationBuilder.DropTable(
                name: "CustomerLedgerEntries");

            migrationBuilder.DropTable(
                name: "FxRevaluationVoucherLines");

            migrationBuilder.DropTable(
                name: "InventoryCostAdjustmentLines");

            migrationBuilder.DropTable(
                name: "InventoryTransactionTraces");

            migrationBuilder.DropTable(
                name: "PurchaseOrderCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "PurchaseOrderCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "PurchaseOrderCustomFieldValues");

            migrationBuilder.DropTable(
                name: "PurchaseReceiptCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "PurchaseReceiptCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "PurchaseReceiptCustomFieldValues");

            migrationBuilder.DropTable(
                name: "PurchaseRequestCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "PurchaseRequestCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "PurchaseRequestCustomFieldValues");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuoteCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuoteCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuoteCustomFieldValues");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuoteLines");

            migrationBuilder.DropTable(
                name: "SalesInvoiceCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "SalesInvoiceCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "SalesInvoiceCustomFieldValues");

            migrationBuilder.DropTable(
                name: "SalesOrderCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "SalesOrderCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "SalesOrderCustomFieldValues");

            migrationBuilder.DropTable(
                name: "SalesQuoteCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "SalesQuoteCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "SalesQuoteCustomFieldValues");

            migrationBuilder.DropTable(
                name: "SalesQuoteLines");

            migrationBuilder.DropTable(
                name: "StockItemCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "StockItemCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "StockItemCustomFieldValues");

            migrationBuilder.DropTable(
                name: "StockItemUnitConversions");

            migrationBuilder.DropTable(
                name: "TenantExchangeRates");

            migrationBuilder.DropTable(
                name: "WarehouseCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "WarehouseCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "WarehouseCustomFieldValues");

            migrationBuilder.DropTable(
                name: "BankStatements");

            migrationBuilder.DropTable(
                name: "FinancialAccountTransactions");

            migrationBuilder.DropTable(
                name: "CustomerCustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "FxRevaluationVouchers");

            migrationBuilder.DropTable(
                name: "InventoryCostAdjustments");

            migrationBuilder.DropTable(
                name: "InventoryTransactions");

            migrationBuilder.DropTable(
                name: "PurchaseOrderCustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "PurchaseReceiptCustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "PurchaseRequestCustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuoteCustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "PurchaseRequestLines");

            migrationBuilder.DropTable(
                name: "SalesInvoiceCustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "SalesOrderCustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "SalesQuoteCustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "StockItemCustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "WarehouseCustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "CustomerCollections");

            migrationBuilder.DropTable(
                name: "FinancialAccountTransfers");

            migrationBuilder.DropTable(
                name: "SupplierPayments");

            migrationBuilder.DropTable(
                name: "InventoryTransfers");

            migrationBuilder.DropTable(
                name: "SalesReturnLines");

            migrationBuilder.DropTable(
                name: "SupplierReturnLines");

            migrationBuilder.DropTable(
                name: "FinancialAccounts");

            migrationBuilder.DropTable(
                name: "SalesInvoiceLines");

            migrationBuilder.DropTable(
                name: "SalesReturns");

            migrationBuilder.DropTable(
                name: "PurchaseInvoiceLines");

            migrationBuilder.DropTable(
                name: "SupplierReturns");

            migrationBuilder.DropTable(
                name: "SalesDeliveryLines");

            migrationBuilder.DropTable(
                name: "SalesInvoices");

            migrationBuilder.DropTable(
                name: "PurchaseReceiptLines");

            migrationBuilder.DropTable(
                name: "PurchaseInvoices");

            migrationBuilder.DropTable(
                name: "SalesOrderReservations");

            migrationBuilder.DropTable(
                name: "SalesDeliveries");

            migrationBuilder.DropTable(
                name: "PurchaseOrderLines");

            migrationBuilder.DropTable(
                name: "PurchaseReceipts");

            migrationBuilder.DropTable(
                name: "SalesOrderLines");

            migrationBuilder.DropTable(
                name: "PurchaseOrders");

            migrationBuilder.DropTable(
                name: "Warehouses");

            migrationBuilder.DropTable(
                name: "SalesOrders");

            migrationBuilder.DropTable(
                name: "StockItems");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuotes");

            migrationBuilder.DropTable(
                name: "SalesQuotes");

            migrationBuilder.DropTable(
                name: "PurchaseRequests");

            migrationBuilder.DropTable(
                name: "CustomerAccounts");

            migrationBuilder.DropTable(
                name: "CustomerGroups");

            migrationBuilder.DropTable(
                name: "Tenants");
        }
    }
}
