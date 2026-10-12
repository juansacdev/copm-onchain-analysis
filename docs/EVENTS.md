# COPM contract events: which ones matter

> One event, `Transfer`, is the whole balance ledger: watch it every day. Every other event is rare, and each new occurrence is news.
>
> 🇪🇸 [Versión en español](./EVENTS.es.md) · 📖 [Glossary](./GLOSSARY.md) · 📊 [Unified audit](./AUDIT.md)

The scan stores every event the COPM contract emits, on both chains. This page says which of them are worth reading and what each one tells you. Counts come from `data/<chain>/` up to Polygon block <!-- copm:polygon.checkpointBlock -->95,378,468<!-- /copm --> and Celo block <!-- copm:celo.checkpointBlock -->79,872,373<!-- /copm --> (<!-- copm:polygon.checkpointDate -->2026-10-12<!-- /copm -->), filled by `npm run reports`.

## The contract

COPM is an ERC-1967 UUPS proxy on both chains: the address people use never changes, the code behind it can. The implementations are verified on Sourcify.

| Chain | Implementation |
| :--- | :--- |
| Polygon | `Token` (`0xc7b9e68e03d9cfecb106149e3af9386e3332ad1f`) at deployment, upgraded to `TokenV1` (`0x056d93f19fa2559e10ae69628ea97483b4d336be`) at block 48,408,019 |
| Celo | `TokenV1` (`0xbb0cf77caaf21dced4f06d3cb987dcb65f15b1c7`) since deployment |

`TokenV1` is built from OpenZeppelin's `ERC20Upgradeable`, `ERC20BurnableUpgradeable`, `PausableUpgradeable`, `AccessControlEnumerableUpgradeable`, `ERC20PermitUpgradeable`, `UUPSUpgradeable` and `MulticallUpgradeable`, plus a custom `Freezable`. Every event below comes from one of those pieces.

## Events at a glance

| Event | Emitted when | What it tells you | Polygon | Celo |
| :--- | :--- | :--- | ---: | ---: |
| `Transfer(from, to, value)` | any balance change | the complete ledger: issuance, redemption and every payment | <!-- copm:polygon.events.Transfer -->241,876<!-- /copm --> | <!-- copm:celo.events.Transfer -->132,944<!-- /copm --> |
| `Approval(owner, spender, value)` | `approve` or `permit` | which contracts are being authorized to spend; moves no value | <!-- copm:polygon.events.Approval -->122,241<!-- /copm --> | <!-- copm:celo.events.Approval -->82,623<!-- /copm --> (lower bound) |
| `Frozen(account)` | `FREEZER_ROLE` blocks an address | a compliance action: the address can neither send nor receive | <!-- copm:polygon.events.Frozen -->0<!-- /copm --> | <!-- copm:celo.events.Frozen -->2<!-- /copm --> |
| `Thawed(account)` | `FREEZER_ROLE` unblocks an address | the block was lifted (also part of a frozen burn) | <!-- copm:polygon.events.Thawed -->0<!-- /copm --> | <!-- copm:celo.events.Thawed -->1<!-- /copm --> |
| `BurnedFrozen(account, amount)` | the issuer destroys a frozen balance | the strongest compliance action | <!-- copm:polygon.events.BurnedFrozen -->0<!-- /copm --> | <!-- copm:celo.events.BurnedFrozen -->1<!-- /copm --> |
| `Paused(account)` | `PAUSER_ROLE` stops the token | every transfer, mint and burn is halted | <!-- copm:polygon.events.Paused -->0<!-- /copm --> | <!-- copm:celo.events.Paused -->0<!-- /copm --> |
| `Unpaused(account)` | `PAUSER_ROLE` resumes the token | the emergency is over | <!-- copm:polygon.events.Unpaused -->0<!-- /copm --> | <!-- copm:celo.events.Unpaused -->0<!-- /copm --> |
| `RoleGranted(role, account, sender)` | a role is given | who can mint, pause, freeze, upgrade or rescue | <!-- copm:polygon.events.RoleGranted -->7<!-- /copm --> | <!-- copm:celo.events.RoleGranted -->6<!-- /copm --> |
| `RoleRevoked(role, account, sender)` | a role is taken away | the same, in reverse | <!-- copm:polygon.events.RoleRevoked -->1<!-- /copm --> | <!-- copm:celo.events.RoleRevoked -->0<!-- /copm --> |
| `RoleAdminChanged(role, previous, new)` | who administers a role changes | the governance structure itself changed | <!-- copm:polygon.events.RoleAdminChanged -->0<!-- /copm --> | <!-- copm:celo.events.RoleAdminChanged -->0<!-- /copm --> |
| `Upgraded(implementation)` | the proxy points to new code | the rules of the token can have changed | <!-- copm:polygon.events.Upgraded -->2<!-- /copm --> | <!-- copm:celo.events.Upgraded -->1<!-- /copm --> |
| `Initialized(version)` | the contract is initialized | accompanies deployment | <!-- copm:polygon.events.Initialized -->1<!-- /copm --> | <!-- copm:celo.events.Initialized -->1<!-- /copm --> |
| `AdminChanged`, `BeaconUpgraded`, `EIP712DomainChanged` | exist in the ABI | never emitted on either chain so far | <!-- copm:polygon.events.AdminChanged -->0<!-- /copm --> / <!-- copm:polygon.events.BeaconUpgraded -->0<!-- /copm --> / <!-- copm:polygon.events.EIP712DomainChanged -->0<!-- /copm --> | <!-- copm:celo.events.AdminChanged -->0<!-- /copm --> / <!-- copm:celo.events.BeaconUpgraded -->0<!-- /copm --> / <!-- copm:celo.events.EIP712DomainChanged -->0<!-- /copm --> |

The Celo approval counter is a lower bound: the public endpoint drops part of the log history, and approvals are counted, not reconciled (see the [Celo audit](./audit/celo.md#limitations)).

## `Transfer`: the ledger

Every balance change in the contract goes through `_mint`, `_burn` or `_transfer`, and all three emit `Transfer`. So one event type covers everything:

- **Mint** is a transfer from the zero address. Money entered the system.
- **Burn** (`burn`, `burnFrom`, `burnFrozen`) is a transfer to the zero address. Money left it.
- **Everything else** is a movement between holders.

Supply, balances, holders, volume and the mint and burn series are all computed from this one event, and the scan proves it: minted − burned equals `totalSupply()` to the wei, and every holder's balance equals `balanceOf`. If you watch only one thing, watch `Transfer`, and within it the transfers from or to the zero address.

## `Approval`: who is authorized

An approval grants spending rights (`permit` emits it too). It moves nothing, so it never changes a balance. What it shows is which contracts (routers, pools, bridges, payment processors) users are authorizing. The scan stores approvals as daily counts and a per-spender tally in `approvals.json`, not row by row.

## Freeze, thaw and frozen burn

While frozen, an address can neither send nor receive. A frozen burn thaws the account, burns its balance and freezes it again, so one call leaves four events in a row: `Thawed`, `Transfer` to the zero address, `Frozen`, `BurnedFrozen`. These are the compliance actions of the issuer. On a settlement rail they should be rare, and any new one is news. Frozen accounts at the checkpoint: <!-- copm:polygon.frozenAccounts -->0<!-- /copm --> on Polygon, <!-- copm:celo.frozenAccounts -->1<!-- /copm --> on Celo.

## Pause

`Paused` stops every transfer, mint and burn until `Unpaused`. It has been emitted <!-- copm:polygon.events.Paused -->0<!-- /copm --> times on Polygon and <!-- copm:celo.events.Paused -->0<!-- /copm --> on Celo. If it ever appears, nothing moves until it is lifted.

## Roles: who has power

The contract defines six roles: `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `PAUSER_ROLE`, `UPGRADER_ROLE`, `FREEZER_ROLE` and `RESCUER_ROLE`. `RoleGranted` and `RoleRevoked` are the only way the list of people who can mint, pause, freeze, upgrade or rescue changes. Today <!-- copm:polygon.roleHolders -->1<!-- /copm --> address holds every role on Polygon (`0x84ec9fabaa0fc41706d57dc775b485e194ee4488`) and <!-- copm:celo.roleHolders -->1<!-- /copm --> on Celo (`0x0155b191ec52728d26b1cd82f6a412d5d6897c04`). Read the current members from the `roles` field of `data/<chain>/holders.json`, which is checked on-chain at every snapshot.

## Upgrades

`Upgraded(implementation)` means the proxy now runs different code. The rules of the token can change with it, so every occurrence deserves a look at the new implementation. `Initialized(version)` accompanies deployment. Polygon has <!-- copm:polygon.events.Upgraded -->2<!-- /copm --> `Upgraded` events (the second is the move from `Token` to `TokenV1`), Celo <!-- copm:celo.events.Upgraded -->1<!-- /copm -->.

## What events do not show

- **Rescued funds.** `rescueFunds(token, to, amount)` emits no event of its own on COPM. It shows up as a `Transfer` of the rescued token from the COPM contract address.
- **Allowances spent.** In this OpenZeppelin version, spending an allowance with `transferFrom` does not emit `Approval`, so a remaining allowance cannot be reconstructed from events.
- **Fiat legs.** The pesos that go in or out of a bank account around a mint or a burn are off-chain.
- **Who a wallet belongs to.** Addresses are not entities.

## A watch list, in order

1. `Transfer` from or to the zero address: issuance and redemption.
2. `Transfer` volume and counterparties.
3. `Frozen` and `BurnedFrozen`.
4. `Paused`.
5. `RoleGranted` and `RoleRevoked`.
6. `Upgraded`.

The first two are daily reading. The rest should almost never fire; when they do, they matter more than any volume number.

## Where to find them

`data/<chain>/transfers/YYYY-MM.jsonl` holds every `Transfer`; `data/<chain>/admin-events.jsonl` holds every other event except approvals (<!-- copm:polygon.adminEvents -->11<!-- /copm --> rows on Polygon, <!-- copm:celo.adminEvents -->12<!-- /copm --> on Celo); `data/<chain>/approvals.json` holds the approval counts. Terms are in the [glossary](./GLOSSARY.md).
