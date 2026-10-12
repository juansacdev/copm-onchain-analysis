# Glosario

> Todos los términos usados en las auditorías y análisis, explicados en lenguaje claro.
> Si puedes leer esta página, puedes leer toda la auditoría.
>
> 🇬🇧 [English version](./GLOSSARY.md)

| Término | Significado |
| :------ | :---------- |
| **Stablecoin** | Un token diseñado para mantener un precio fijo contra un activo de referencia. COPM apunta a 1 COPM = 1 peso colombiano (COP). |
| **Peg** | La promesa de que un token equivale a una unidad del activo de referencia. Un "peg 1:1 con depósitos bancarios" significa que cada token en circulación está respaldado por un peso en un banco. |
| **Mint** | Crear tokens nuevos. En contratos ERC-20 aparece como un `Transfer` **desde** la zero address (`0x000…000`). Un mint significa que entró dinero al sistema: alguien depositó pesos y recibió COPM. |
| **Burn** | Destruir tokens. Un `Transfer` **hacia** la zero address. Un burn significa que salió dinero del sistema: alguien redimió COPM y recibió pesos. |
| **Zero address** | `0x0000000000000000000000000000000000000000` — una dirección especial que nadie controla. Los tokens que salen "de" ella se están creando; los que van "hacia" ella se están destruyendo. |
| **ERC-20** | El estándar de tokens fungibles en chains EVM. Garantiza, entre otras cosas, que cada movimiento de tokens emite un evento `Transfer`. |
| **Evento `Transfer`** | El log que un contrato ERC-20 emite en cada movimiento: quién envió (`from`), quién recibió (`to`) y cuánto (`value`). Es la unidad atómica de toda esta auditoría. |
| **Event signature / topic** | El identificador hasheado de un tipo de evento. Todos los `Transfer` llevan el mismo primer topic (`0xddf252ad…`), y así se filtran entre millones de bloques. |
| **Log index** | La posición de un evento dentro de su transacción. Junto con el hash de la transacción identifica un evento de forma única — así detectamos duplicados. |
| **EVM** | Ethereum Virtual Machine — el entorno de ejecución que comparten Ethereum, Polygon, Celo y muchas otras chains. Mismo bytecode, mismo formato de eventos, distinta red. |
| **Deploy block** | El bloque donde el bytecode del contrato aparece por primera vez en la chain. Todo lo anterior es irrelevante para el token; todo lo posterior está en el alcance. |
| **RPC (endpoint)** | La puerta de API hacia un nodo de la blockchain. Todo en esta auditoría sale de llamadas RPC estándar (`eth_getLogs`, `eth_getBlockByNumber`, `eth_call`) — sin indexers de terceros. Funciona con un proveedor de pago o con un endpoint público. |
| **`eth_getLogs`** | El método RPC que devuelve eventos según un filtro (contrato + topic + rango de bloques). El scanner lo llama miles de veces, por trozos, para recuperar la historia completa. |
| **Indexer** | Un servicio de terceros (The Graph, Dune, exploradores de bloques) que pre-procesa la data de la chain para poder consultarla. Esta auditoría los evita a propósito: solo RPC crudo, para que cualquiera reproduzca los números sin confiar en un intermediario. |
| **Volumen bruto (gross)** | La suma de **todos** los transfers, incluyendo mints y burns. La medida más amplia de movimiento on-chain. |
| **Volumen neto (net)** | Volumen bruto menos mints y burns — solo movimientos entre wallets. Más cercano a "dinero cambiando de manos entre usuarios". |
| **TRM** | Tasa Representativa del Mercado: la tasa oficial de COP por USD de cada día, certificada por la Superintendencia Financiera de Colombia y publicada como dato abierto en datos.gov.co. Una tasa cubre un rango de días calendario (fines de semana y festivos usan la del día hábil anterior). Toda cifra en USD valora cada día a la TRM de ese día y 1 COPM como 1 COP; los totales en USD son sumas de montos diarios. Los días son días UTC y cada uno toma la TRM cuya vigencia, en calendario colombiano, contiene esa misma fecha; una transferencia a las 23:30 hora de Colombia (04:30 UTC del día siguiente) toma la tasa del día siguiente: un desfase de hasta cinco horas. |
| **Supply circulante** | Los tokens que existen ahora mismo: todos los mints menos todos los burns. Aquí se deriva reproduciendo cada evento desde el deploy block. |
| **Rotación / velocidad** | Cuántas veces se mueve el supply en un período: `volumen ÷ supply`. Una velocidad de 400x/año significa que cada token cambió de manos ~400 veces al año — la firma de un rail de pagos, no de una reserva de valor. |
| **Settlement layer / rail** | Infraestructura cuyo trabajo es mover valor entre partes, no almacenarlo. Velocidad alta + mints/burns balanceados es como se ve un settlement rail on-chain. |
| **On-ramp / off-ramp** | Los puentes entre dinero fiat y tokens: pesos → COPM (on-ramp, un mint) y COPM → pesos (off-ramp, un burn). |
| **Proxy contract** | Un patrón de contrato donde la dirección con la que interactúan los usuarios delega su lógica a una implementación actualizable. COPM usa uno (ERC-1967, UUPS): cada cambio de implementación emite un evento `Upgraded`. |
| **Decimales (18)** | Los montos ERC-20 se guardan como enteros. Con 18 decimales, `1 COPM` se guarda como `1000000000000000000`. Todos los valores de la data cruda están en esa unidad. |
| **Timestamp de bloque** | El momento en que se produjo un bloque. Cada transferencia del dataset lleva el timestamp exacto de su bloque, tomado del log o del header del bloque, así que un día nunca es una estimación. |
| **Reconciliación** | Comprobar que dos lecturas independientes del mismo hecho coinciden. Aquí: minted − burned, sumado desde los eventos, debe ser igual al `totalSupply()` del contrato en el mismo bloque, al wei; y el balance de cada holder debe ser igual a `balanceOf`. |
| **Checkpoint** | El último bloque que el scan verificó por completo. Se escribe solo después de reconciliar, así que una corrida que se detiene a la mitad continúa desde él y todo lo que esté por encima se descarta. |
| **Canario** | Un bloque cuya cantidad de logs ya se conoce, agregado a cada lote RPC. Si el endpoint no devuelve exactamente esa cantidad, se descarta todo el lote: es la señal de que el backend no tiene parte del índice de logs. |
| **Wei** | La unidad mínima de un token de 18 decimales: 1 COPM son 10¹⁸ wei. "Al wei" significa sin ningún redondeo ni tolerancia. |
| **Evento del contrato (log)** | Un registro que el contrato emite cuando algo ocurre: una transferencia, una aprobación, un congelamiento, un cambio de rol, una actualización. [Cuáles importan](./EVENTS.es.md). |
