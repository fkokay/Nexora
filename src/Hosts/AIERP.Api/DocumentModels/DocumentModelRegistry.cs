namespace AIERP.Api.DocumentModels;

/// <summary>The document models a Belge page may name (<c>template.document</c>). Only satış siparişi so far.</summary>
internal static class DocumentModelRegistry
{
    internal static DocumentModelView? Find(string? code) => code == SalesOrderDocumentModel.Code ? SalesOrderDocumentModel.Model : null;
}
