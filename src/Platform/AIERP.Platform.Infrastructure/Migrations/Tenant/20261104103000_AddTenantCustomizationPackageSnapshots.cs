using System;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261104103000_AddTenantCustomizationPackageSnapshots")]
public sealed class AddTenantCustomizationPackageSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "TenantCustomizationPackageSnapshots",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Version = table.Column<int>(type: "int", nullable: false),
                Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                PackageJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                Sha256 = table.Column<string>(type: "char(64)", fixedLength: true, unicode: false, maxLength: 64, nullable: false),
                CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_TenantCustomizationPackageSnapshots", x => x.Id);
                table.ForeignKey("FK_TenantCustomizationPackageSnapshots_Tenants_TenantId", x => x.TenantId,
                    principalTable: "Tenants", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex("IX_TenantCustomizationPackageSnapshots_TenantId_CreatedAt",
            "TenantCustomizationPackageSnapshots", new[] { "TenantId", "CreatedAt" });
        migrationBuilder.CreateIndex("IX_TenantCustomizationPackageSnapshots_TenantId_Version",
            "TenantCustomizationPackageSnapshots", new[] { "TenantId", "Version" }, unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "TenantCustomizationPackageSnapshots");

    protected override void BuildTargetModel(ModelBuilder modelBuilder)
    {
        modelBuilder.HasAnnotation("ProductVersion", "10.0.13")
            .HasAnnotation("Relational:MaxIdentifierLength", 128);
        modelBuilder.Entity("AIERP.Platform.Domain.TenantCustomizationPackageSnapshot", entity =>
        {
            entity.Property<Guid>("Id").HasColumnType("uniqueidentifier");
            entity.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
            entity.Property<Guid>("CreatedByUserId").HasColumnType("uniqueidentifier");
            entity.Property<string>("Name").IsRequired().HasMaxLength(120).HasColumnType("nvarchar(120)");
            entity.Property<string>("PackageJson").IsRequired().HasColumnType("nvarchar(max)");
            entity.Property<string>("Sha256").IsRequired().HasMaxLength(64).IsUnicode(false).IsFixedLength().HasColumnType("char(64)");
            entity.Property<Guid>("TenantId").HasColumnType("uniqueidentifier");
            entity.Property<int>("Version").HasColumnType("int");
            entity.HasKey("Id");
            entity.HasIndex("TenantId", "CreatedAt");
            entity.HasIndex("TenantId", "Version").IsUnique();
            entity.HasOne("AIERP.Platform.Domain.Tenant", null).WithMany().HasForeignKey("TenantId")
                .OnDelete(DeleteBehavior.Restrict).IsRequired();
            entity.ToTable("TenantCustomizationPackageSnapshots");
        });
    }
}
