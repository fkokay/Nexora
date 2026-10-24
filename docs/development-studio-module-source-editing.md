# Development Studio: ERP module source edits

The ERP Developer Mode panel opens Development Studio with the active screen context. For a registered tenant module, the Studio request keeps the module code (for example, `module:inventory-tools:stock`), so the task remains identifiable after leaving the ERP screen.

## Map the source project

Studio projects represent HTTPS source repositories; they are not installed ERP modules. Nexora does not infer which repository contains a module. A project maintainer or tenant administrator can use **Modül kaynağı** to record an explicit tenant mapping for an enabled module code. The mapping displays the registered repository URL, a user-confirmed Git ref, and a validated relative path allowlist. The repository itself must already be registered as a Studio project; the mapping form cannot enter or change a repository URL.

Mappings are audited and tenant scoped. They are reference metadata for human verification; they do not grant repository access, automatically select a project, change workspace behavior, or enforce the path list in the current editor. A module code in a development request remains context only. Users still select the authorized Studio project and starting branch when requesting a workspace.

## Edit and review

Create a workspace request from an authorized project and select its starting branch. A reviewer must approve the request before Runner creates its isolated local checkout. In Project Explorer, users can inspect files and manually edit eligible source files. Saving requires explicit confirmation and applies only to a ready workspace; the API checks the project grant, source-code license, file path, content size, and expected file hash before sending the write to Runner. Changes are audited. Workspace code is not executed by a save.

## Publish boundaries

Saving a file changes only the local workspace. Committing changes is a separate confirmed action. A release candidate requires a clean workspace and successful sandbox evidence for the exact commit; a different TenantAdmin must independently approve it. Version assignment, pull-request publication, package creation, staging deployment, and production promotion are separate actions with their own checks and confirmations. No Studio source edit directly changes a running ERP module.

The Studio does not provide an in-browser module-code editor against a live ERP installation. Verify the mapping and source paths, select the authorized project, edit and review the isolated workspace, then follow the release process appropriate to that project. Existing GitHub authorization, sandbox, approval, and publishing controls remain in effect.
