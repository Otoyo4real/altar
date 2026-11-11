
## Dormant (quiet tithe) proof — v5 demo (2026-11-11T17:20:53.679Z)

Ran on altar-ritual-v5-demo.testnet (600s rounds, grace 1, rate 1%). Runs after the core, Feast and NEAR AI proofs. D1 claims 100, D2 holds 10,000, neither offers except D1's single 10 in R+4.

- get_params quiet: grace 1, rate_bp 100, total_collected 0
- starting supply 1040164.12212578054769679, treasury 1480, streak 9
- helper create altar-quiet1.testnet: status 200
- created wallet altar-quiet1.testnet
- helper create altar-quiet2.testnet: status 200
- created wallet altar-quiet2.testnet

## Dormant (quiet tithe) proof — v5 demo (2026-11-11T17:50:25.441Z)

Ran on altar-ritual-v5-demo.testnet (600s rounds, grace 1, rate 1%). Runs after the core, Feast and NEAR AI proofs. D1 claims 100, D2 holds 10,000, neither offers except D1's single 10 in R+4.

- get_params quiet: grace 1, rate_bp 100, total_collected 0
- starting supply 1040164.12212578054769679, treasury 1480, streak 9
- wallet already exists: altar-quiet1.testnet
- wallet already exists: altar-quiet2.testnet
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":null,"last_swept_round":null,"quiet_rounds":0,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet2.testnet: {"account_id":"altar-quiet2.testnet","last_offer_round":null,"last_swept_round":null,"quiet_rounds":0,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- round R will be 2990699 (573s left, threshold 2596710305314451369241)
- claim altar-quiet1.testnet: ByiW2mFxESFbzR1zPWzBg6u64qhWKmNABBC1uVu971Fi
- balance altar-quiet1.testnet after claim: 100
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990699,"last_swept_round":2990699,"quiet_rounds":0,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- storage_deposit altar-quiet2.testnet: 6BLrW6YHTMPiX71i115aUkbcYcEeC1zv7s5eLfyEfKQw
- ft_transfer 10000 -> altar-quiet2.testnet: CLj3iHScsnBZ1Ty8wbFaYYtsaQKqf4YKCB57vNM5xY2M
- balance altar-quiet2.testnet after funding: 10000
- get_quiet altar-quiet2.testnet: {"account_id":"altar-quiet2.testnet","last_offer_round":2990699,"last_swept_round":2990699,"quiet_rounds":0,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- round R is 2990699; D1 clock and D2 clock both start at 2990699
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990699,"last_swept_round":2990699,"quiet_rounds":2,"taxable_rounds":1,"would_deduct":"1000000000000000000","exempt":false}
- sweep_quiet altar-quiet1.testnet (D1 first sweep): 71pwsSvgPiE37o2iX6cB6ybM29SGsTRzb18gL41Eubhn
-   (view lag: treasury after sweep_quiet altar-quiet1.testnet took 2 reads to show 1481000000000000000000)
-   treasury before 1480 after 1481 delta 1 (expected 1)
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990699,"last_swept_round":2990701,"quiet_rounds":2,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- D1 after first sweep: balance 99, collected 1000000000000000000
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990699,"last_swept_round":2990701,"quiet_rounds":3,"taxable_rounds":1,"would_deduct":"990000000000000000","exempt":false}
- sweep_quiet altar-quiet1.testnet (D1 second sweep): BMRvRcSsz3zcBJgwhFFf9H3RbUZtKidV1yeHMJKfehKi
-   treasury before 1481 after 1481.99 delta 0.99 (expected 0.99)
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990699,"last_swept_round":2990702,"quiet_rounds":3,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- D1 after second sweep: balance 98.01, collected 1990000000000000000
- get_reputation altar-quiet1.testnet in round 2990703: max_offer 10000000000000000000
- offer 10 altar-quiet1.testnet in round 2990703: J2JyBUab6N484DpNUiw3aqPRnJcghg3aqEgaYR6Zi9VP
- round 2990703 after D1 offer: total_offered=10000000000000000000 offerer_count=1 threshold=2596955330314451369241
- round 2990703 ended; settling with answer() until the record exists (v5 settles at most 5 rounds per call, and rounds R..R+4 plus any earlier unsettled rounds may need more than one call)
- answer tx: CA3QDotUt5zZWAWbvd5bXQtrucQXZ7zb5RzrLz4QwhP3
- answer tx: 4EGxuVF5zGdoYTEEH53stjyGV8zhcAvP8nufs6c5XYaQ
- round 2990703 record: {"round_id":2990703,"total_offered":"10000000000000000000","offerer_count":1,"status":"Failed","last_offerer":"altar-quiet1.testnet","minted":"0","offerer_total":"0","burned":"10000000000000000000","feast_paid":"0","streak_after":0,"oracle_prediction":null,"oracle_outcome":"none","oracle_rewarded":"0","oracle_burned":"0","oracle_path":null,"oracle_model":null,"oracle_proof":null}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}

## Dormant proof RESUME after a wrong script assertion (2026-11-11T18:42:48.500Z)

The run stopped on its own wrong expectation after D1's R+4 offer: it expected quiet_rounds 0, but the check runs in round R+5, one round after the offer, so quiet_rounds is 1 (taxable 0, would_deduct 0 — the clock did reset). The failed run's log already shows get_quiet D1 in R+5 as quiet 1, taxable 0, would_deduct 0. Resuming in round R+5 with the corrected expectation; D1's sweeps (1 + 0.99) and the R+4 failed offer (10 burned) already passed.

- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- D1 after the failed offer: balance 88.01, quiet clock reset to 2990703
- get_quiet altar-quiet1.testnet: {"account_id":"altar-quiet1.testnet","last_offer_round":2990703,"last_swept_round":2990703,"quiet_rounds":1,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- sweep_quiet altar-quiet1.testnet (D1 third sweep, nothing due): 4KQtn8n8wqi8f7Sh4ZEgLUcVJvCyGgS5oxD7YzZjpd8S
-   treasury before 1481.99 after 1481.99 delta 0 (expected 0)
- D1 after third sweep: balance still 88.01
- get_quiet altar-quiet2.testnet: {"account_id":"altar-quiet2.testnet","last_offer_round":2990699,"last_swept_round":2990699,"quiet_rounds":5,"taxable_rounds":4,"would_deduct":"400000000000000000000","exempt":false}
- sweep_quiet altar-quiet2.testnet (D2 first sweep): BMbYeoYqqLqjQP1Mf4awesrqnLuFMz5kAXsDzQHPfrsd
-   treasury before 1481.99 after 1881.99 delta 400 (expected 400)
- get_quiet altar-quiet2.testnet: {"account_id":"altar-quiet2.testnet","last_offer_round":2990699,"last_swept_round":2990704,"quiet_rounds":5,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- D2 after first sweep: balance 9,600, collected 401990000000000000000
- get_quiet altar-quiet2.testnet: {"account_id":"altar-quiet2.testnet","last_offer_round":2990699,"last_swept_round":2990704,"quiet_rounds":7,"taxable_rounds":2,"would_deduct":"192000000000000000000","exempt":false}
- sweep_quiet altar-quiet2.testnet (D2 second sweep): 2QuP2NYNAzjhKBCrQMoPwmb45f2vYwdmZu99LJycnqmk
-   treasury before 1881.99 after 2073.99 delta 192 (expected 192)
- get_quiet altar-quiet2.testnet: {"account_id":"altar-quiet2.testnet","last_offer_round":2990699,"last_swept_round":2990706,"quiet_rounds":7,"taxable_rounds":0,"would_deduct":"0","exempt":false}
- D2 after second sweep: balance 9,408, collected 593990000000000000000
- get_quiet altar-oracle.testnet: {"account_id":"altar-oracle.testnet","last_offer_round":null,"last_swept_round":null,"quiet_rounds":0,"taxable_rounds":0,"would_deduct":"0","exempt":true}
- sweep_quiet altar-oracle.testnet (Oracle exemption sweep): 68jyjeCbUVJHgVoF82aXwLyCp4cVafE9cDtkwadyTwWC
-   treasury before 2073.99 after 2073.99 delta 0 (expected 0)
- Oracle balance unchanged by the exemption sweep: 5020
- get_quiet altar-ritual-v5-demo.testnet: {"account_id":"altar-ritual-v5-demo.testnet","last_offer_round":null,"last_swept_round":null,"quiet_rounds":0,"taxable_rounds":0,"would_deduct":"0","exempt":true}
- sweep_quiet altar-ritual-v5-demo.testnet (altar exemption sweep): DzLdReGDkqkwuqc3mBYRvQfwu2Rbw7p5kfBcDWfEgurC
-   treasury before 2073.99 after 2073.99 delta 0 (expected 0)
- altar itself exempt: sweep returned 0, nothing taken
- final quiet_total_collected: 593990000000000000000
- treasury at dormant start 1480, now 2073.99, delta 593.99 (expected 593.99)
- supply at dormant start 1040164.12212578054769679, now 1040254.12212578054769679 (expected start + 90: the 100 claim minus the 10 burned in the failed R+4 offer)
- final balance altar-quiet1.testnet: 88.01 (expected 88.01)
- final balance altar-quiet2.testnet: 9408 (expected 9,408)
- final streak: 0
- DORMANT PROOF V5 DONE
