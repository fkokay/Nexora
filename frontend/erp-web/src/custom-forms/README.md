# Custom forms components

`CustomFormsPage.tsx` owns API requests and page state. The catalog, builder, and revision history UI live in `components/` and receive typed values and callbacks through props. Keep state transitions and network operations in the page container when extending this feature.
