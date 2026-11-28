namespace AIERP.Api.DocumentModels;

/// <summary>The document models a Belge page may name (<c>template.document</c>). Satış siparişi and satış teklifi so far.</summary>
internal static class DocumentModelRegistry
{
    internal static DocumentModelView? Find(string? code) => code switch
    {
        SalesOrderDocumentModel.Code => SalesOrderDocumentModel.Model,
        SalesQuoteDocumentModel.Code => SalesQuoteDocumentModel.Model,
        InventoryTransferDocumentModel.Code => InventoryTransferDocumentModel.Model,
        JournalVoucherDocumentModel.Code => JournalVoucherDocumentModel.Model,
        SalesInvoiceDocumentModel.Code => SalesInvoiceDocumentModel.Model,
        SalesDeliveryDocumentModel.Code => SalesDeliveryDocumentModel.Model,
        ManufacturingRecipeDocumentModel.Code => ManufacturingRecipeDocumentModel.Model,
        _ => null
    };
}
