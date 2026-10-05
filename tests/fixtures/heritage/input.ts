export interface BaseSchema<$Item>
  extends SchemaDitoMixin<$Item>,
    SchemaTypeMixin<$Item> {
  default?: any
}

export interface InputSchema<$Item = any>
  extends BaseSchema<$Item>,
    SchemaTextMixin<$Item>,
    SchemaAffixMixin<$Item> {
  type: 'text'
}

export interface DitoFormInstance<$Item = any>
  extends DitoComponentInstanceBase<$Item> {
  isCreating: boolean
}

interface Short extends A, B {
  x: string
}

interface ObjectionModelStatic
  extends Omit<
    typeof objection.Model,
    'modifiers' | 'query' | 'fromJson' | 'createNotFoundError'
  > {
  new (): objection.Model
}
