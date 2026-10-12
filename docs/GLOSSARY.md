# Glossary

> Every term used across the audits and analyses, explained in plain language.
> If you can read this page, you can read the whole audit.
>
> 🇪🇸 [Versión en español](./GLOSSARY.es.md)

| Term | Meaning |
| :--- | :------ |
| **Stablecoin** | A token designed to hold a fixed price against a reference asset. COPM targets 1 COPM = 1 Colombian peso (COP). |
| **Peg** | The promise that one token equals one unit of the reference asset. A "1:1 peg with bank deposits" means every token in circulation is backed by a peso held in a bank. |
| **Mint** | Creating new tokens. On ERC-20 contracts it shows up as a `Transfer` **from** the zero address (`0x000…000`). A mint means money entered the system: someone deposited pesos and received COPM. |
| **Burn** | Destroying tokens. A `Transfer` **to** the zero address. A burn means money left the system: someone redeemed COPM and got pesos back. |
| **Zero address** | `0x0000000000000000000000000000000000000000` — a special address nobody controls. Tokens "from" it are being created; tokens "to" it are being destroyed. |
| **ERC-20** | The standard interface for fungible tokens on EVM chains. It guarantees, among other things, that every token movement emits a `Transfer` event. |
| **`Transfer` event** | The log an ERC-20 contract emits on every token movement: who sent (`from`), who received (`to`), and how much (`value`). It is the atomic unit of this entire audit. |
| **Event signature / topic** | The hashed identifier of an event type. Every `Transfer` carries the same first topic (`0xddf252ad…`), which is how you filter them out of millions of blocks. |
| **Log index** | The position of an event inside its transaction. Together with the transaction hash it uniquely identifies one event — that's how we detect duplicates. |
| **EVM** | Ethereum Virtual Machine — the execution environment shared by Ethereum, Polygon, Celo and many other chains. Same contract bytecode, same event format, different networks. |
| **Deploy block** | The block where the contract's bytecode first appears on the chain. Everything before it is irrelevant to the token; everything after is in scope. |
| **RPC (endpoint)** | The API door into a blockchain node. Everything in this audit comes from standard RPC calls (`eth_getLogs`, `eth_getBlockByNumber`, `eth_call`) — no third-party indexers. Works with a paid provider or a public endpoint. |
| **`eth_getLogs`** | The RPC method that returns events matching a filter (contract + topic + block range). The scanner calls it thousands of times, in chunks, to retrieve the complete history. |
| **Indexer** | A third-party service (The Graph, Dune, block explorers) that pre-processes chain data so you can query it. This audit deliberately avoids them: raw RPC only, so anyone can reproduce the numbers without trusting an intermediary. |
| **Gross volume** | The sum of **every** transfer, including mints and burns. The broadest measure of on-chain movement. |
| **Net volume** | Gross volume minus mints and burns — only wallet-to-wallet movements. Closer to "money actually changing hands between users". |
| **Circulating supply** | Tokens that exist right now: all mints minus all burns. Derived here by replaying every event from the deploy block. |
| **Turnover / velocity** | How many times the supply moves in a period: `volume ÷ supply`. A velocity of 400x/year means each token changed hands ~400 times a year — the signature of a payment rail, not a store of value. |
| **Settlement layer / rail** | Infrastructure whose job is moving value between parties, rather than holding it. High velocity + balanced mints/burns is what a settlement rail looks like on-chain. |
| **On-ramp / off-ramp** | The bridges between fiat money and tokens: pesos → COPM (on-ramp, a mint) and COPM → pesos (off-ramp, a burn). |
| **Proxy contract** | A contract pattern where the address users interact with delegates its logic to an upgradeable implementation. COPM uses one — relevant when interpreting low-level events. |
| **Decimals (18)** | ERC-20 amounts are stored as integers. With 18 decimals, `1 COPM` is stored as `1000000000000000000`. All values in the raw data are in this unit. |
| **Block timestamp interpolation** | Instead of querying the timestamp of every one of ~100K+ blocks, we fetch a few hundred samples and linearly interpolate the rest. Max error: seconds — irrelevant for daily aggregates. |
| **Spot check** | Picking random events from the dataset and re-fetching their transaction receipts live from the chain, verifying that block, log index and amount match. Part of the validation step. |
