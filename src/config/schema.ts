/**
 * MAPEO DE TU BASE DE DATOS (Supabase)
 * =====================================
 *
 * La app NO cambia tu estructura de Supabase: se adapta a ella.
 *
 * Para cada tabla y cada dato que la app necesita hay una lista de nombres
 * posibles. Al iniciar sesión la app revisa tu base de datos y usa el PRIMER
 * nombre que exista. Si conoces el nombre exacto de una tabla o columna,
 * deja solo ese nombre en la lista, por ejemplo:
 *
 *     latitud: ['lat_cliente'],
 *
 * La pantalla Perfil → "Verificar conexión" muestra qué tabla y qué columna
 * se detectó para cada dato, y cuáles faltan.
 */

/** Columnas que identifican al usuario (promotor) dueño de un registro. */
const COLUMNAS_USUARIO = [
  'user_id',
  'usuario_id',
  'id_usuario',
  'promotor_id',
  'id_promotor',
  'uid',
  'user_uid',
  'auth_id',
  'email',
  'correo',
  'email_usuario',
  'correo_usuario',
  'email_promotor',
  'correo_promotor',
  'usuario',
  'promotor',
  'asignado_a',
]

export interface TableSpec<F extends string> {
  /** Nombres posibles de la tabla, en orden de preferencia. */
  table: string[]
  /** Nombres posibles de cada columna, en orden de preferencia. */
  fields: Record<F, string[]>
  /** Datos sin los cuales la tabla no puede usarse. */
  required: F[]
}

export type ClienteField =
  | 'id'
  | 'nombre'
  | 'direccion'
  | 'latitud'
  | 'longitud'
  | 'ubicacion'
  | 'asignadoA'
  | 'visitado'
  | 'telefono'
  | 'codigo'

export type PreguntaField =
  | 'id'
  | 'texto'
  | 'tipo'
  | 'opciones'
  | 'orden'
  | 'obligatoria'
  | 'activa'
  | 'ayuda'

export type ReglaField = 'id' | 'pregunta' | 'dependeDe' | 'valor' | 'operador' | 'accion'

export type VisitaField =
  | 'id'
  | 'cliente'
  | 'usuario'
  | 'inicio'
  | 'fin'
  | 'latitud'
  | 'longitud'
  | 'ubicacion'
  | 'distancia'
  | 'precision'
  | 'estado'
  | 'duracion'
  | 'realizada'

export type RespuestaField =
  | 'id'
  | 'visita'
  | 'pregunta'
  | 'preguntaTexto'
  | 'respuesta'
  | 'cliente'
  | 'usuario'
  | 'fecha'

export type ResultadoField = 'usuario' | 'cliente' | 'titulo' | 'fecha'

export type PerfilField = 'id' | 'authId' | 'email' | 'nombre'

export interface Schema {
  clientes: TableSpec<ClienteField>
  preguntas: TableSpec<PreguntaField>
  reglas: TableSpec<ReglaField>
  visitas: TableSpec<VisitaField>
  respuestas: TableSpec<RespuestaField>
  resultados: TableSpec<ResultadoField>
  perfiles: TableSpec<PerfilField>
}

export const schema: Schema = {
  /** Clientes / tiendas que cargas a cada promotor. */
  clientes: {
    table: ['clientes', 'lista_clientes', 'clientes_promotor', 'cliente', 'tiendas', 'puntos_venta'],
    fields: {
      id: ['id', 'id_cliente', 'cliente_id', 'uuid'],
      nombre: [
        'nombre',
        'nombre_cliente',
        'cliente',
        'nombre_comercial',
        'razon_social',
        'nombre_tienda',
        'tienda',
        'name',
      ],
      direccion: ['direccion', 'direccion_cliente', 'domicilio', 'calle', 'address'],
      latitud: ['latitud', 'lat', 'latitude', 'latitud_cliente'],
      longitud: ['longitud', 'lng', 'lon', 'long', 'longitude', 'longitud_cliente'],
      // Ubicación en una sola columna ("19.43,-99.13", JSON o PostGIS). Solo se usa si no hay latitud/longitud.
      ubicacion: ['ubicacion', 'coordenadas', 'latlng', 'lat_lng', 'geolocalizacion', 'location'],
      asignadoA: COLUMNAS_USUARIO,
      // Columna que marca al cliente como visitado (booleano o texto).
      // Si tu tabla no la tiene, la app considera visitado a todo cliente con una visita registrada.
      visitado: [
        'visitado',
        'visitada',
        'estado_visita',
        'estatus_visita',
        'status_visita',
        'visita_realizada',
        'completado',
        'finalizado',
      ],
      telefono: ['telefono', 'celular', 'tel', 'movil', 'whatsapp', 'phone'],
      codigo: [
        'codigo',
        'codigo_cliente',
        'cod_cliente',
        'clave',
        'clave_cliente',
        'numero_cliente',
        'no_cliente',
        'sap',
      ],
    },
    required: ['id', 'nombre'],
  },

  /** Preguntas del formulario de visita. */
  preguntas: {
    table: ['preguntas', 'pregunta', 'preguntas_visita', 'cuestionario'],
    fields: {
      id: ['id', 'id_pregunta', 'pregunta_id'],
      texto: ['pregunta', 'texto', 'texto_pregunta', 'enunciado', 'descripcion', 'titulo', 'nombre', 'label'],
      tipo: ['tipo', 'tipo_pregunta', 'tipo_respuesta', 'tipo_campo', 'type'],
      // Opciones: arreglo, JSON o texto separado por comas, punto y coma, | o saltos de línea.
      opciones: ['opciones', 'opciones_respuesta', 'respuestas', 'alternativas', 'valores', 'options'],
      orden: ['orden', 'posicion', 'numero', 'numero_pregunta', 'secuencia', 'order', 'num'],
      obligatoria: ['obligatoria', 'obligatorio', 'requerida', 'requerido', 'es_obligatoria', 'required'],
      activa: ['activa', 'activo', 'habilitada', 'habilitado', 'active'],
      ayuda: ['ayuda', 'descripcion_ayuda', 'placeholder', 'hint', 'nota', 'subtitulo'],
    },
    required: ['id', 'texto'],
  },

  /**
   * Reglas de visibilidad (tabla preguntas_reglas).
   * Una regla dice: muestra la pregunta `pregunta` cuando la respuesta a `dependeDe` cumple `operador` + `valor`.
   * También se soporta el formato "salto": pregunta_id + respuesta + siguiente_pregunta_id.
   */
  reglas: {
    table: ['preguntas_reglas', 'reglas_preguntas', 'reglas'],
    fields: {
      id: ['id'],
      // Pregunta que se muestra u oculta.
      pregunta: [
        'pregunta_destino_id',
        'siguiente_pregunta_id',
        'pregunta_siguiente_id',
        'mostrar_pregunta_id',
        'pregunta_mostrar_id',
        'pregunta_hija_id',
        'id_pregunta_hija',
        'pregunta_id',
        'id_pregunta',
      ],
      // Pregunta cuya respuesta se evalúa.
      dependeDe: [
        'pregunta_padre_id',
        'id_pregunta_padre',
        'depende_de_pregunta_id',
        'depende_de',
        'depende_de_id',
        'pregunta_origen_id',
        'pregunta_condicion_id',
        'pregunta_anterior_id',
        'condicion_pregunta_id',
        'pregunta_id',
        'id_pregunta',
      ],
      valor: [
        'valor',
        'respuesta',
        'respuesta_esperada',
        'valor_esperado',
        'valor_condicion',
        'respuesta_condicion',
        'condicion_valor',
        'si_respuesta',
        'cuando_respuesta',
        'value',
      ],
      // Opcional: =, !=, >, <, >=, <=, contiene, respondida… (si no existe se usa "igual a").
      operador: ['operador', 'operacion', 'comparador', 'condicion', 'operator'],
      // Opcional: mostrar / ocultar (si no existe se usa "mostrar").
      accion: ['accion', 'action', 'tipo_regla', 'efecto', 'mostrar'],
    },
    // Si los nombres no coinciden, al leer las reglas se deducen por las palabras de cada columna
    // (destino, siguiente, mostrar… / padre, origen, condición, depende…).
    required: [],
  },

  /** Registro de cada visita finalizada. */
  visitas: {
    table: ['visitas', 'visita', 'visitas_clientes', 'registro_visitas'],
    fields: {
      id: ['id', 'id_visita', 'visita_id'],
      cliente: ['cliente_id', 'id_cliente', 'cliente'],
      usuario: COLUMNAS_USUARIO,
      inicio: ['fecha_inicio', 'hora_inicio', 'fecha_hora_inicio', 'inicio', 'inicio_visita', 'started_at', 'check_in'],
      fin: ['fecha_fin', 'hora_fin', 'fecha_hora_fin', 'fin', 'fin_visita', 'fecha_visita', 'fecha', 'finished_at', 'check_out'],
      latitud: ['latitud', 'lat', 'latitud_visita', 'lat_visita', 'latitud_inicio'],
      longitud: ['longitud', 'lng', 'lon', 'longitud_visita', 'lng_visita', 'lon_visita', 'longitud_inicio'],
      ubicacion: ['ubicacion', 'ubicacion_visita', 'coordenadas', 'coordenadas_visita', 'latlng'],
      distancia: [
        'distancia',
        'distancia_m',
        'distancia_metros',
        'distancia_cliente',
        'distancia_visita',
        'distancia_tienda',
        'metros',
        'distance',
      ],
      precision: ['precision', 'precision_m', 'precision_gps', 'precision_visita', 'exactitud', 'accuracy'],
      estado: ['estado', 'estado_visita', 'estatus', 'estatus_visita', 'status', 'status_visita'],
      duracion: ['duracion', 'duracion_visita', 'duracion_min', 'duracion_minutos', 'minutos'],
      // Marca de "visita hecha" (FlutterFlow la guardaba en true al finalizar).
      realizada: [
        'visita_realizada',
        'realizada',
        'visita_completada',
        'completada',
        'visita_finalizada',
        'finalizada',
        'visita_terminada',
        'terminada',
      ],
    },
    required: ['cliente'],
  },

  /** Respuestas del formulario (una fila por pregunta respondida). */
  respuestas: {
    table: [
      'respuestas',
      'respuestas_visita',
      'respuestas_visitas',
      'visitas_respuestas',
      'respuestas_preguntas',
      'respuesta',
    ],
    fields: {
      id: ['id'],
      visita: ['visita_id', 'id_visita', 'visita'],
      pregunta: ['pregunta_id', 'id_pregunta', 'pregunta'],
      preguntaTexto: ['pregunta_texto', 'texto_pregunta', 'pregunta'],
      respuesta: ['respuesta', 'valor', 'respuesta_texto', 'texto', 'value', 'answer'],
      cliente: ['cliente_id', 'id_cliente', 'cliente'],
      usuario: COLUMNAS_USUARIO,
      fecha: ['fecha', 'fecha_respuesta', 'fecha_hora'],
    },
    required: ['pregunta', 'respuesta'],
  },

  /** Tabla de resultados que cargas tú en Supabase (página "Resultados"). */
  resultados: {
    table: [
      'resultados',
      'resultados_visitas',
      'resultados_visita',
      'resultados_promotor',
      'resultados_promotores',
      'resultado',
    ],
    fields: {
      usuario: COLUMNAS_USUARIO,
      cliente: ['cliente_id', 'id_cliente'],
      titulo: ['titulo', 'indicador', 'concepto', 'kpi', 'metrica', 'nombre', 'descripcion'],
      fecha: ['fecha', 'periodo', 'mes', 'semana', 'created_at'],
    },
    required: [],
  },

  /** Opcional: tabla de usuarios/promotores (para mostrar el nombre y enlazar por id propio). */
  perfiles: {
    table: ['usuarios', 'promotores', 'perfiles', 'profiles', 'users'],
    fields: {
      id: ['id'],
      authId: ['user_id', 'auth_id', 'uid', 'id_auth', 'auth_user_id'],
      email: ['email', 'correo', 'correo_electronico', 'mail'],
      nombre: ['nombre', 'nombre_completo', 'full_name', 'name', 'display_name', 'nombres'],
    },
    required: ['id'],
  },
}

/** Valores de texto que significan "cliente visitado" (sin importar mayúsculas ni acentos). */
export const VALORES_VISITADO = [
  'visitado',
  'visitada',
  'si',
  'true',
  '1',
  'finalizado',
  'finalizada',
  'completado',
  'completada',
  'realizado',
  'realizada',
  'hecho',
  'ok',
]

/** Valor que se escribe en la columna "visitado" cuando es de texto (si no hay otro ejemplo en tus datos). */
export const VALOR_VISITADO_TEXTO = 'visitado'

/** Valor que se escribe en visitas.estado (si la columna existe). */
export const VALOR_ESTADO_VISITA = 'finalizada'

/**
 * Valor de visitas.visita_realizada (o similar) al finalizar. Si la columna no es booleana, la app prueba
 * 1, "Sí", "Si"… hasta que la base lo acepte.
 */
export const VALOR_VISITA_REALIZADA = true

/**
 * INFORMACIÓN DEL CLIENTE (ficha del cliente)
 * Solo se muestran estos datos, en este orden. Para cada uno se busca la columna de tu tabla de clientes:
 *  - `columnas`: nombres exactos posibles.
 *  - `palabras`: si no hay nombre exacto, una columna cuyo nombre contenga TODAS las palabras de algún grupo.
 * En ambos casos no importan mayúsculas, acentos, espacios ni guiones bajos ("Status_cuponera" = "status cuponera").
 * `tipo`: 'destacado' (número grande), 'metrica' (mosaico de "últimos 3 meses") o 'dato' (fila).
 */
export interface CampoInfoCliente {
  etiqueta: string
  tipo: 'destacado' | 'metrica' | 'dato'
  columnas?: string[]
  palabras?: string[][]
}

export const INFO_CLIENTE: CampoInfoCliente[] = [
  { etiqueta: 'Saldo aprox. en puntos', tipo: 'destacado', palabras: [['saldo']] },
  { etiqueta: 'Status autogestión', tipo: 'dato', palabras: [['autogestion']] },
  { etiqueta: 'Inscrito en Premia', tipo: 'dato', palabras: [['premia']] },
  { etiqueta: 'Cuponera', tipo: 'dato', columnas: ['cuponera'], palabras: [['cuponera']] },
  { etiqueta: 'Status cuponera', tipo: 'dato', palabras: [['status', 'cuponera'], ['estatus', 'cuponera']] },
  { etiqueta: 'Canal', tipo: 'dato', columnas: ['canal', 'canal_venta', 'canal_de_venta'], palabras: [['canal']] },
  { etiqueta: 'Canjes', tipo: 'metrica', palabras: [['canje']] },
  { etiqueta: 'Promos', tipo: 'metrica', palabras: [['promos'], ['promociones'], ['promo', 'mes']] },
  { etiqueta: 'Lotería', tipo: 'metrica', palabras: [['loteria']] },
  { etiqueta: 'Retos', tipo: 'metrica', palabras: [['retos'], ['reto', 'mes']] },
]

/** Título del grupo de datos tipo 'metrica'. */
export const TITULO_METRICAS = 'Últimos 3 meses'

/** Etiquetas bonitas para columnas en Resultados (opcional). Ej.: { ventas_mes: 'Ventas del mes' } */
export const ETIQUETAS: Record<string, string> = {}
