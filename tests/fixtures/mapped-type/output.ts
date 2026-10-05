export type ModelHooks3<$Model extends Model = Model> = {
  [key in
    | "find"
    | "insert"]?: ModelHookFunction<$Model>;
};

export type ModelHooks4<$Model extends Model = Model> = {
  [
    key in
      | "find"
      | "insert"
  ]?: ModelHookFunction<$Model>;
};

export type ModelHooks5<$Model extends Model = Model> = {
  [key in "find" | "insert"]?: ModelHookFunction<$Model>;
};
