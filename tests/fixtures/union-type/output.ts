type Method1 = "get" | "post";

type Method2 =
  | "get"
  | "post";

type Method3 =
  | "get"
  | "post";

function request(method: "get" | "post") {}

type Component<X> =
  X extends Record<string, any>
    ?
        | NonOptionFieldComponent<X>
        | OptionComponent<X, NonNullable<X>>
    :
        | NonSectionComponent<X>
        | SectionSchema<X>;
