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
| **Supply circulante** | Los tokens que existen ahora mismo: todos los mints menos todos los burns. Aquí se deriva reproduciendo cada evento desde el deploy block. |
| **Rotación / velocidad** | Cuántas veces se mueve el supply en un período: `volumen ÷ supply`. Una velocidad de 400x/año significa que cada token cambió de manos ~400 veces al año — la firma de un rail de pagos, no de una reserva de valor. |
| **Settlement layer / rail** | Infraestructura cuyo trabajo es mover valor entre partes, no almacenarlo. Velocidad alta + mints/burns balanceados es como se ve un settlement rail on-chain. |
| **On-ramp / off-ramp** | Los puentes entre dinero fiat y tokens: pesos → COPM (on-ramp, un mint) y COPM → pesos (off-ramp, un burn). |
| **Proxy contract** | Un patrón de contrato donde la dirección con la que interactúan los usuarios delega su lógica a una implementación actualizable. COPM usa uno — relevante al interpretar eventos de bajo nivel. |
| **Decimales (18)** | Los montos ERC-20 se guardan como enteros. Con 18 decimales, `1 COPM` se guarda como `1000000000000000000`. Todos los valores de la data cruda están en esa unidad. |
| **Interpolación de timestamps** | En vez de consultar el timestamp de cada uno de los +100K bloques, se consultan unos cientos de muestras y se interpola linealmente el resto. Error máximo: segundos — irrelevante para agregados diarios. |
| **Spot check** | Tomar eventos aleatorios del dataset y volver a consultar sus receipts en vivo contra la chain, verificando que bloque, log index y monto coincidan. Parte del paso de validación. |
