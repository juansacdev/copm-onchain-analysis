# Eventos del contrato COPM: cuáles importan

> Un evento, `Transfer`, es todo el libro de saldos: míralo todos los días. Cualquier otro evento es raro, y cada aparición nueva es noticia.
>
> 🇬🇧 [English version](./EVENTS.md) · 📖 [Glosario](./GLOSSARY.es.md) · 📊 [Auditoría unificada](./AUDIT.es.md)

El scan guarda todos los eventos que emite el contrato de COPM, en ambas chains. Esta página dice cuáles vale la pena leer y qué te cuenta cada uno. Los conteos salen de `data/<chain>/` hasta el bloque <!-- copm:polygon.checkpointBlock -->95.378.468<!-- /copm --> de Polygon y el bloque <!-- copm:celo.checkpointBlock -->79.872.373<!-- /copm --> de Celo (<!-- copm:polygon.checkpointDate -->2026-10-12<!-- /copm -->), y los completa `npm run reports`.

## El contrato

COPM es un proxy ERC-1967 UUPS en ambas chains: la dirección que usa la gente no cambia, el código detrás de ella sí puede cambiar. Las implementaciones están verificadas en Sourcify.

| Chain | Implementación |
| :--- | :--- |
| Polygon | `Token` (`0xc7b9e68e03d9cfecb106149e3af9386e3332ad1f`) en el deploy, actualizada a `TokenV1` (`0x056d93f19fa2559e10ae69628ea97483b4d336be`) en el bloque 48.408.019 |
| Celo | `TokenV1` (`0xbb0cf77caaf21dced4f06d3cb987dcb65f15b1c7`) desde el deploy |

`TokenV1` se construye con `ERC20Upgradeable`, `ERC20BurnableUpgradeable`, `PausableUpgradeable`, `AccessControlEnumerableUpgradeable`, `ERC20PermitUpgradeable`, `UUPSUpgradeable` y `MulticallUpgradeable` de OpenZeppelin, más un `Freezable` propio. Cada evento de abajo viene de una de esas piezas.

## Los eventos de un vistazo

| Evento | Se emite cuando | Qué te cuenta | Polygon | Celo |
| :--- | :--- | :--- | ---: | ---: |
| `Transfer(from, to, value)` | cualquier cambio de saldo | el libro completo: emisión, redención y cada pago | <!-- copm:polygon.events.Transfer -->241.876<!-- /copm --> | <!-- copm:celo.events.Transfer -->132.944<!-- /copm --> |
| `Approval(owner, spender, value)` | `approve` o `permit` | qué contratos están autorizados a gastar; no mueve valor | <!-- copm:polygon.events.Approval -->122.241<!-- /copm --> | <!-- copm:celo.events.Approval -->82.623<!-- /copm --> (cota inferior) |
| `Frozen(account)` | el `FREEZER_ROLE` bloquea una dirección | una acción de cumplimiento: la dirección no puede enviar ni recibir | <!-- copm:polygon.events.Frozen -->0<!-- /copm --> | <!-- copm:celo.events.Frozen -->2<!-- /copm --> |
| `Thawed(account)` | el `FREEZER_ROLE` desbloquea una dirección | se levantó el bloqueo (también forma parte de un burn de cuenta congelada) | <!-- copm:polygon.events.Thawed -->0<!-- /copm --> | <!-- copm:celo.events.Thawed -->1<!-- /copm --> |
| `BurnedFrozen(account, amount)` | el emisor destruye un saldo congelado | la acción de cumplimiento más fuerte | <!-- copm:polygon.events.BurnedFrozen -->0<!-- /copm --> | <!-- copm:celo.events.BurnedFrozen -->1<!-- /copm --> |
| `Paused(account)` | el `PAUSER_ROLE` detiene el token | se frena toda transferencia, mint y burn | <!-- copm:polygon.events.Paused -->0<!-- /copm --> | <!-- copm:celo.events.Paused -->0<!-- /copm --> |
| `Unpaused(account)` | el `PAUSER_ROLE` reanuda el token | terminó la emergencia | <!-- copm:polygon.events.Unpaused -->0<!-- /copm --> | <!-- copm:celo.events.Unpaused -->0<!-- /copm --> |
| `RoleGranted(role, account, sender)` | se otorga un rol | quién puede acuñar, pausar, congelar, actualizar o rescatar | <!-- copm:polygon.events.RoleGranted -->7<!-- /copm --> | <!-- copm:celo.events.RoleGranted -->6<!-- /copm --> |
| `RoleRevoked(role, account, sender)` | se quita un rol | lo mismo, a la inversa | <!-- copm:polygon.events.RoleRevoked -->1<!-- /copm --> | <!-- copm:celo.events.RoleRevoked -->0<!-- /copm --> |
| `RoleAdminChanged(role, previous, new)` | cambia quién administra un rol | cambió la estructura de gobierno misma | <!-- copm:polygon.events.RoleAdminChanged -->0<!-- /copm --> | <!-- copm:celo.events.RoleAdminChanged -->0<!-- /copm --> |
| `Upgraded(implementation)` | el proxy apunta a código nuevo | las reglas del token pueden haber cambiado | <!-- copm:polygon.events.Upgraded -->2<!-- /copm --> | <!-- copm:celo.events.Upgraded -->1<!-- /copm --> |
| `Initialized(version)` | se inicializa el contrato | acompaña al deploy | <!-- copm:polygon.events.Initialized -->1<!-- /copm --> | <!-- copm:celo.events.Initialized -->1<!-- /copm --> |
| `AdminChanged`, `BeaconUpgraded`, `EIP712DomainChanged` | existen en el ABI | nunca se emitieron en ninguna de las dos chains hasta ahora | <!-- copm:polygon.events.AdminChanged -->0<!-- /copm --> / <!-- copm:polygon.events.BeaconUpgraded -->0<!-- /copm --> / <!-- copm:polygon.events.EIP712DomainChanged -->0<!-- /copm --> | <!-- copm:celo.events.AdminChanged -->0<!-- /copm --> / <!-- copm:celo.events.BeaconUpgraded -->0<!-- /copm --> / <!-- copm:celo.events.EIP712DomainChanged -->0<!-- /copm --> |

El contador de approvals de Celo es una cota inferior: el endpoint público pierde parte del historial de logs, y los approvals se cuentan, no se reconcilian (ver la [auditoría de Celo](./audit/celo.es.md#limitaciones)).

## `Transfer`: el libro de saldos

Todo cambio de saldo del contrato pasa por `_mint`, `_burn` o `_transfer`, y los tres emiten `Transfer`. Así que un solo tipo de evento lo cubre todo:

- **Mint** es una transferencia desde la zero address. Entró dinero al sistema.
- **Burn** (`burn`, `burnFrom`, `burnFrozen`) es una transferencia hacia la zero address. Salió dinero.
- **Todo lo demás** es un movimiento entre holders.

El supply, los saldos, los holders, el volumen y las series de mints y burns se calculan con este único evento, y el scan lo comprueba: minted − burned es igual a `totalSupply()` al wei, y el saldo de cada holder es igual a `balanceOf`. Si vas a mirar una sola cosa, mira `Transfer`, y dentro de él las transferencias desde o hacia la zero address.

## `Approval`: quién está autorizado

Un approval otorga derechos de gasto (`permit` también lo emite). No mueve nada, así que nunca cambia un saldo. Lo que muestra es qué contratos (routers, pools, bridges, procesadores de pago) están autorizando los usuarios. El scan guarda los approvals como conteos diarios y un acumulado por spender en `approvals.json`, no fila por fila.

## Congelar, descongelar y burn de cuenta congelada

Mientras está congelada, una dirección no puede enviar ni recibir. Un burn de cuenta congelada la descongela, quema su saldo y la vuelve a congelar, así que una sola llamada deja cuatro eventos seguidos: `Thawed`, `Transfer` hacia la zero address, `Frozen`, `BurnedFrozen`. Son las acciones de cumplimiento del emisor. En un settlement rail deberían ser raras, y cualquiera nueva es noticia. Cuentas congeladas en el checkpoint: <!-- copm:polygon.frozenAccounts -->0<!-- /copm --> en Polygon, <!-- copm:celo.frozenAccounts -->1<!-- /copm --> en Celo.

## Pausa

`Paused` detiene toda transferencia, mint y burn hasta que se emita `Unpaused`. Se ha emitido <!-- copm:polygon.events.Paused -->0<!-- /copm --> veces en Polygon y <!-- copm:celo.events.Paused -->0<!-- /copm --> en Celo. Si alguna vez aparece, nada se mueve hasta que se levante.

## Roles: quién tiene poder

El contrato define seis roles: `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `PAUSER_ROLE`, `UPGRADER_ROLE`, `FREEZER_ROLE` y `RESCUER_ROLE`. `RoleGranted` y `RoleRevoked` son la única forma en que cambia la lista de quienes pueden acuñar, pausar, congelar, actualizar o rescatar. Hoy <!-- copm:polygon.roleHolders -->1<!-- /copm --> dirección tiene todos los roles en Polygon (`0x84ec9fabaa0fc41706d57dc775b485e194ee4488`) y <!-- copm:celo.roleHolders -->1<!-- /copm --> en Celo (`0x0155b191ec52728d26b1cd82f6a412d5d6897c04`). Lee los miembros actuales en el campo `roles` de `data/<chain>/holders.json`, que se verifica on-chain en cada snapshot.

## Actualizaciones

`Upgraded(implementation)` significa que el proxy ahora ejecuta código distinto. Las reglas del token pueden cambiar con él, así que cada aparición merece una mirada a la nueva implementación. `Initialized(version)` acompaña al deploy. Polygon tiene <!-- copm:polygon.events.Upgraded -->2<!-- /copm --> eventos `Upgraded` (el segundo es el paso de `Token` a `TokenV1`), Celo <!-- copm:celo.events.Upgraded -->1<!-- /copm -->.

## Lo que los eventos no muestran

- **Fondos rescatados.** `rescueFunds(token, to, amount)` no emite ningún evento propio en COPM. Aparece como un `Transfer` del token rescatado desde la dirección del contrato COPM.
- **Allowances gastados.** En esta versión de OpenZeppelin, gastar un allowance con `transferFrom` no emite `Approval`, así que un allowance restante no se puede reconstruir desde los eventos.
- **Los tramos en fiat.** Los pesos que entran o salen de una cuenta bancaria alrededor de un mint o un burn están fuera de la chain.
- **A quién pertenece una wallet.** Las direcciones no son entidades.

## Una lista de vigilancia, en orden

1. `Transfer` desde o hacia la zero address: emisión y redención.
2. Volumen y contrapartes de `Transfer`.
3. `Frozen` y `BurnedFrozen`.
4. `Paused`.
5. `RoleGranted` y `RoleRevoked`.
6. `Upgraded`.

Los dos primeros son de lectura diaria. Los demás casi nunca deberían dispararse; cuando lo hacen, importan más que cualquier cifra de volumen.

## Dónde encontrarlos

`data/<chain>/transfers/YYYY-MM.jsonl` guarda cada `Transfer`; `data/<chain>/admin-events.jsonl` guarda todos los demás eventos salvo los approvals (<!-- copm:polygon.adminEvents -->11<!-- /copm --> filas en Polygon, <!-- copm:celo.adminEvents -->12<!-- /copm --> en Celo); `data/<chain>/approvals.json` guarda los conteos de approvals. Los términos están en el [glosario](./GLOSSARY.es.md).
