
## Live proof — v5 demo (2026-11-11T15:46:59.621Z)

Ran on altar-ritual-v5-demo.testnet (600s rounds, Oracle altar-oracle.testnet). v5: settlement is pull (answer settles at most 5 rounds per call, answer_round settles one, PASS rewards are claimed individually). The v4 contracts are abandoned.

- storage_deposit altar-proof1.testnet: 12nchBSBEGwYbSLa2Kg6TgTnJ67cd7S7wWri9tZhbxDM
- ft_transfer 10000000000000000000000 -> altar-proof1.testnet: DXzmFB3s8ApxsJVirz3oNyDvikAsuKj79VNDPF7YLkxi
- balance altar-proof1.testnet: 10000000000000000000000
- storage_deposit altar-proof2.testnet: HnyHrRn5Gkc9PH7uUAQFrpZ8hLaVK9V6XSLxMqqnN4mG
- ft_transfer 10000000000000000000000 -> altar-proof2.testnet: 2t1ERhYsNx3ijsfvjgviaRHwBu7ei7BfqJFnUZcFVbSk
- balance altar-proof2.testnet: 10000000000000000000000
- storage_deposit altar-proof3.testnet: 6mbSeJSt7nVF85yVRCHQ3ADBDTmdVEeQvoUnqXXAHC8x
- ft_transfer 10000000000000000000000 -> altar-proof3.testnet: 73uhP2GvZN9ybT7rpEmCWHPM6sVn6HxkjoXLmAuuZQEM
- balance altar-proof3.testnet: 10000000000000000000000
- storage_deposit altar-proof4.testnet: HiLekfRYmnFhnorZbVSDG7de3Mv7XfgJ5aqP1nWCbpfi
- ft_transfer 10000000000000000000000 -> altar-proof4.testnet: EsS4p4J6DBBr8nZvgD496KvwjfaJAxyfAu8PkGZ4JLg7
- balance altar-proof4.testnet: 10000000000000000000000
- storage_deposit altar-proof5.testnet: 5qkHcRKCiadGWByXUi6RZcH8VPwypbtkbAc7hqJG15ab
- ft_transfer 10000000000000000000000 -> altar-proof5.testnet: 72RxX1jFhydcpNNGYmFEpaCK5m4ZPCVBN5jJWdXgU4Eo
- balance altar-proof5.testnet: 10000000000000000000000
- storage_deposit altar-proof6.testnet: AUvCUkxiqTwzndRMWz64aAsPqEsWCHws1yJeyspiEikA
- ft_transfer 10000000000000000000000 -> altar-proof6.testnet: 65mU29zrVMRNEteFjEjD14w2iGdxtmTQ6nwoj7Qqeh7g
- balance altar-proof6.testnet: 10000000000000000000000
- oracle balance: 5000000000000000000000
- get_oracle at start: {"oracle":"altar-oracle.testnet","prediction":null,"correct":0,"wrong":0,"total_staked":"0","total_rewarded":"0","total_burned":"0","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- get_claimed altar-claim1.testnet before: false
- claim altar-claim1.testnet: D7yd7j5ufnivnyHgjJTToR6Ax3hxE1c3RhPSFvp9pbTu
-   balance altar-claim1.testnet: 100000000000000000000
-   get_claimed altar-claim1.testnet after: true
- get_claimed altar-claim2.testnet before: false
- claim altar-claim2.testnet: Doikq6pthvDLPSQkCzz3u8X8eudrCRMvuqTvtZTRtSRo
-   balance altar-claim2.testnet: 100000000000000000000
-   get_claimed altar-claim2.testnet after: true
- total_claimed in get_params: 200000000000000000000
- second claim altar-claim1.testnet failed as expected: {"index":0,"kind":{"index":0,"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: panicked at src/lib.rs:981:9:\nalready claimed: one claim per wallet"}}}}
- balance altar-claim1.testnet after failed second claim: 100000000000000000000
- get_claimed altar-proof1.testnet (never claimed): false
- FAIL round will be 2990686 (139s left, threshold 2500500000000000000000)
- offer 10 altar-proof1.testnet: FkPWxYsQ9Y2MusJA8KQQJePzo4snF5724YwojBAsMLSw
- offer 10 altar-proof2.testnet: 7UFJFau6erSVkiNKmCnRQvn6iqZ32dpzv4rtqETbve7L
- offer 10 altar-proof3.testnet: A9jTC1TCpVw1Gc6hpAxvAHa3mnS7ZzL6vDic7D5L1YsK
- offer 10 altar-proof4.testnet: 9Ghto5ppPhMKZSRgp4MyMxRhbAGwFV1AAJZrF91LYhJ6
- offer 10 altar-proof5.testnet: EcrpXccnJsbBqoXNkeXbfBUojheamUNYirUWXgKifRbw

## Live proof RESUMED after service restart (2026-11-11T15:49:43.973Z)

The first run was killed by a service restart mid-round-A. Recovered state: setup + claims done (see above); round A offers proof1-5 logged, proof6's offer confirmed onchain (60 offered / 6 offerers) with its tx hash lost in the restart, claim1/claim2 offers placed by hand (CN8tCxyyTLSiuugrQfHGjLubKJRNyg94pyrnjkWHCWw2, 2mELr8yjB9kEc9tWUWzqqJqCW9e3BUpLNMBRwUTLgtsz). Round A is 80 offered / 8 offerers.

- offer 10 altar-proof6.testnet: landed onchain before the restart (offering read 60/6), tx hash lost with the killed process
- offer 10 altar-claim1.testnet: CN8tCxyyTLSiuugrQfHGjLubKJRNyg94pyrnjkWHCWw2
- offer 10 altar-claim2.testnet: 2mELr8yjB9kEc9tWUWzqqJqCW9e3BUpLNMBRwUTLgtsz
- round 2990686 after offers: total_offered=80000000000000000000 offerer_count=8 threshold=2500500000000000000000
- round 2990686 ended; settling with answer()
- answer tx: GGjV1PkhPzN2FrKwHqajtNMBpYgnvmsws9V2FFebD6EW
- round 2990686 record: {"round_id":2990686,"total_offered":"80000000000000000000","offerer_count":8,"status":"Failed","last_offerer":"altar-claim2.testnet","minted":"0","offerer_total":"0","burned":"80000000000000000000","feast_paid":"0","streak_after":0,"oracle_prediction":null,"oracle_outcome":"none","oracle_rewarded":"0","oracle_burned":"0","oracle_path":null,"oracle_model":null,"oracle_proof":null}
- supply after fail: 1000120000000000000000000
- streak after fail: 0
- balance altar-claim1.testnet after fail (90 expected): 90000000000000000000
- balance altar-claim2.testnet after fail (90 expected): 90000000000000000000
- get_claimable_reward altar-proof1.testnet round 2990686 (failed): 0 (expected 0)
- claim_reward on failed round 2990686 failed as expected: {"index":0,"kind":{"index":0,"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: panicked at src/lib.rs:1405:9:\nonly a passed rou
- PASS round will be 2990687 (572s left, threshold 2500300000000000000000)
- offer 499 altar-proof1.testnet: jaSnyGFLtiydFcL9eShrrNLybU1TgDiUJRsCaDgRyLS
- offer 499 altar-proof2.testnet: 5MSkRBLL38MEp84cMdJA71hSBTu5kbWrTkWpYoKs3N4C
- offer 499 altar-proof3.testnet: 7R1sjAidbARGttPpyk2Lo4iBQ6qbx1i8HTmscjYW8Eqz
- offer 499 altar-proof4.testnet: FeCmHyYL996MvB5cTCC4xCsXu3iCKogQ9QC2bamWcVur
- offer 499 altar-proof5.testnet: 2GGxEb8292JvHtKRdSUMj69YNRsbsjoehg2ebFUMc1tx
- offer 499 altar-proof6.testnet: 2HQPskyMwGtMDMJtfF9kU71DFf2dXVgkPPDnN78JUqPG
- round 2990687 after offers: total_offered=2495000000000000000000 offerer_count=5 threshold=2500300000000000000000
- note: the 'round 2990687 after offers' line above read 2,495/5 because the RPC view lagged a block behind; a re-read 2 minutes later showed the true state (2,994 offered, 6 offerers, last offerer altar-proof6.testnet, all six balances 9,491). All six 499 offers landed; the round will pass.
- round 2990687 ended; settling with answer_round(2990687)
- answer_round(2990687) tx: DKdDbzqKcuBGH7i6tjZqDfxXRDbog69QUUSoKAVodqX9
- round 2990687 record: {"round_id":2990687,"total_offered":"2994000000000000000000","offerer_count":6,"status":"Passed","last_offerer":"altar-proof6.testnet","minted":"6736500000000000000000","offerer_total":"5988000000000000000000","burned":"2994000000000000000000","feast_paid":"0","streak_after":1,"oracle_prediction":null,"oracle_outcome":"none","oracle_rewarded":"0","oracle_burned":"0","oracle_path":null,"oracle_model":null,"oracle_proof":null}

## Live proof FINISH after a wrong script assertion (2026-11-11T16:00:53.428Z)

The resume script stopped after round B settled: it asserted supply == 1,006,856.5 (1,000,120 + minted 6,736.5). That expectation was wrong, not the contract: the offered 2,994 is burned at settlement, so the net supply change is (2.25 - 1) x 2,994 = 3,742.5 and the true supply is 1,000,120 - 2,994 + 5,988 + 748.5 = 1,003,862.5. The round record (minted 6,736.5, offerer_total 5,988, streak 1) was exactly right. This script verifies the corrected numbers and runs the claims.

- supply after pass: 1003862500000000000000000 (expected 1,003,862.5 = 1,000,120 - 2,994 burned + 5,988 offerers' share + 748.5 treasury share)
- treasury after pass: 748500000000000000000 (expected 748.5)
- streak after pass: 1 (expected 1)
- balance altar-proof1.testnet after settlement, before claim (9,491 expected): 9491000000000000000000
- balance altar-proof2.testnet after settlement, before claim (9,491 expected): 9491000000000000000000
- balance altar-proof3.testnet after settlement, before claim (9,491 expected): 9491000000000000000000
- balance altar-proof4.testnet after settlement, before claim (9,491 expected): 9491000000000000000000
- balance altar-proof5.testnet after settlement, before claim (9,491 expected): 9491000000000000000000
- balance altar-proof6.testnet after settlement, before claim (9,491 expected): 9491000000000000000000
- get_claimable_reward altar-claim1.testnet round 2990687 (offered nothing): 0 (expected 0)
- get_claimable_reward altar-proof1.testnet round 2990687 before claim: 998000000000000000000 (expected 998)
- claim_reward altar-proof1.testnet round 2990687: 22pM4uoLa1jEYnYF2D9kj7Qa9L14qJsLXUQhFyDc3gCf
-   balance altar-proof1.testnet delta 0 (expected 998)

## Live proof FINISH, second attempt (2026-11-11T16:01:23.645Z)

The first finish script stopped on proof1's claim: the claim tx landed (receipt shows the 998 transfer, tx 22pM4uoLa1jEYnYF2D9kj7Qa9L14qJsLXUQhFyDc3gCf) but the balance view read immediately after was stale (9,491). A later re-read showed proof1 at 10,489 with claimable 0. FastNEAR views can lag a block, so every post-tx view here polls until the expected value appears.

- altar-proof1.testnet already claimed round 2990687 (balance 10489000000000000000000, claimable 0) — verified, skipping
- get_claimable_reward altar-proof2.testnet round 2990687 before claim: 998000000000000000000 (expected 998)
- claim_reward altar-proof2.testnet round 2990687: Df7si6526jqC65U7Sgbj9bVM4TY7GtGqHuX3dQARjEn9
-   balance altar-proof2.testnet before 9491000000000000000000 after 10489000000000000000000 delta 998000000000000000000 (expected 998)
-   get_claimable_reward altar-proof2.testnet round 2990687 after claim: 0 (expected 0)
-   second claim_reward altar-proof2.testnet round 2990687 failed as expected: {"index":0,"kind":{"index":0,"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: panicked at src/lib.rs:1409:9:\nreward already cl
- get_claimable_reward altar-proof3.testnet round 2990687 before claim: 998000000000000000000 (expected 998)
- claim_reward altar-proof3.testnet round 2990687: 4jznnQBweLRpPzoE46S9mQJWjFuCKofTn1k6dMDjdRVf
-   balance altar-proof3.testnet before 9491000000000000000000 after 10489000000000000000000 delta 998000000000000000000 (expected 998)
-   get_claimable_reward altar-proof3.testnet round 2990687 after claim: 0 (expected 0)
-   second claim_reward altar-proof3.testnet round 2990687 failed as expected: {"index":0,"kind":{"index":0,"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: panicked at src/lib.rs:1409:9:\nreward already cl
- get_claimable_reward altar-proof4.testnet round 2990687 before claim: 998000000000000000000 (expected 998)
- claim_reward altar-proof4.testnet round 2990687: 48aftkzSwKSp5zNnrxQKPgjwkS4rV87tHXkzAZLbKyvG
-   balance altar-proof4.testnet before 9491000000000000000000 after 10489000000000000000000 delta 998000000000000000000 (expected 998)
-   get_claimable_reward altar-proof4.testnet round 2990687 after claim: 0 (expected 0)
-   second claim_reward altar-proof4.testnet round 2990687 failed as expected: {"index":0,"kind":{"index":0,"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: panicked at src/lib.rs:1409:9:\nreward already cl
- get_claimable_reward altar-proof5.testnet round 2990687 before claim: 998000000000000000000 (expected 998)
- claim_reward altar-proof5.testnet round 2990687: JAs6E8TYAcuSKNE2yjTVmdJ3tkx9bBbQ3W9PmD4ihdN4
-   balance altar-proof5.testnet before 9491000000000000000000 after 10489000000000000000000 delta 998000000000000000000 (expected 998)
-   get_claimable_reward altar-proof5.testnet round 2990687 after claim: 0 (expected 0)
-   second claim_reward altar-proof5.testnet round 2990687 failed as expected: {"index":0,"kind":{"index":0,"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: panicked at src/lib.rs:1409:9:\nreward already cl
- get_claimable_reward altar-proof6.testnet round 2990687 before claim: 998000000000000000000 (expected 998)
- claim_reward altar-proof6.testnet round 2990687: 6MMPHoDKbPwGKXk498PEJ7SPjUvrBF5c2xkKSRLqH4ma
-   balance altar-proof6.testnet before 9491000000000000000000 after 10489000000000000000000 delta 998000000000000000000 (expected 998)
-   get_claimable_reward altar-proof6.testnet round 2990687 after claim: 0 (expected 0)
-   second claim_reward altar-proof6.testnet round 2990687 failed as expected: {"index":0,"kind":{"index":0,"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: panicked at src/lib.rs:1409:9:\nreward already cl
- balance altar-proof1.testnet after claim (10,489 expected): 10489000000000000000000
- balance altar-proof2.testnet after claim (10,489 expected): 10489000000000000000000
- balance altar-proof3.testnet after claim (10,489 expected): 10489000000000000000000
- balance altar-proof4.testnet after claim (10,489 expected): 10489000000000000000000
- balance altar-proof5.testnet after claim (10,489 expected): 10489000000000000000000
- balance altar-proof6.testnet after claim (10,489 expected): 10489000000000000000000
- treasury after all claims (748.5, unchanged by claims): 748500000000000000000
- LIVE PROOF V5 DONE (Feast continues in feast-proof-v5.mjs)
