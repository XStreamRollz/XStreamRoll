/**
 * @xstreamroll/contract-tests
 *
 * Consumer/provider contract definitions shared between the API and
 * the SDK. This package is the source of truth for "what does the SDK
 * expect from each endpoint" — the provider verification suite (in
 * `api/`) and the consumer suite (in `xstreamroll-sdk/`) both import
 * the same `Contract` objects from here, so the two sides can't
 * independently drift.
 *
 * Update the relevant `*.contract.ts` file whenever a request or
 * response shape changes; both suites will fail on the next CI run
 * until they're brought back in sync.
 */

export * from "./contract"
export * from "./schemas"
export * from "./streams.contract"
export * from "./auth.contract"

import { authContracts } from "./auth.contract"
import type { Contract } from "./contract"
import { streamsContracts } from "./streams.contract"

/** Every contract in the suite, across all resources. */
export const allContracts: Contract[] = [...streamsContracts, ...authContracts]
