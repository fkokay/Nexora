import CustomerCreatePage, {
  type CustomerCreatePageProps,
} from "./CustomerCreatePage";

/** Dedicated workspace screen for editing an existing customer card. */
export default function CustomerEditPage(props: CustomerCreatePageProps) {
  return (
    <div className="customer-edit-screen">
      <CustomerCreatePage {...props} />
    </div>
  );
}
