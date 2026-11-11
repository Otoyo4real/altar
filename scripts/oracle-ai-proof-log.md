
## NEAR AI Oracle proof — v3 demo (2026-11-11T09:59:06.712Z)

Ran on altar-ritual-v3-demo.testnet (600s rounds, Oracle altar-oracle.testnet). Model z-ai/glm-5.3-flash on NEAR AI Cloud.

- starting round 2990651, ends in 53s, offered 0
- waiting for round 2990651 to end...
- round 2990651 ended; calling answer()
- answer tx: 5fmNN2NUcdseWYjXQdnAz1xoRazvHX8artumx7KswAeQ
- round 2990651 record: {"round_id":2990651,"total_offered":"0","offerer_count":0,"status":"Failed","last_offerer":null,"minted":"0","burned":"0","feast_paid":"0","streak_after":0,"oracle_prediction":null,"oracle_outcome":"none","oracle_rewarded":"0","oracle_burned":"0"}
- --- round A (NEAR AI) 2990652, ends in 589s, threshold 2573906327583807602860
- get_oracle before round A: {"oracle":"altar-oracle.testnet","prediction":null,"correct":1,"wrong":1,"total_staked":"200000000000000000000","total_rewarded":"10000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- offer 500 altar-proof1.testnet: FHyqJZSWT6hTt6x3J2wZG183hatMJrhfs3kBFTqkhvVY
- offer 500 altar-proof2.testnet: 91wbLX7wfxFVU2ftmXU33rj2vENSibGi4CcdC5sPV8U9
- offer 500 altar-proof3.testnet: HYLwpyNJfCsqDhgPQ7PAWaQ5LqKrnDbRe1foLrwT26Lz
- offer 500 altar-proof4.testnet: Ho5aJXJSnhjJJXVxA87UbfHoFWpTRXmoD6daCMpDyog1
- offer 500 altar-proof5.testnet: 8JtdQtZeCDQ4pKfgw4d3o8h3bcNYXSfWcFwzQ9jK3bdj
- offer 500 altar-proof6.testnet: CvXXNRKLQJvovY8u9H5p8aKrj7cuY6N3YRmRkoG5UYiw
- round 2990652 after offers: total_offered=3000000000000000000000 offerer_count=6 threshold=2573906327583807602860

## Resume after oracle.mjs syntax fix (2026-11-11T10:03:09.635Z)

Round A prediction already onchain (oracle_predict 9fkEE4YL6bC86bX4ohW8C5zr7bKkAjWJ3FMeqyxTSRBE, NEAR AI PASS, chat_id 27b95863073448c7888342b568c3ca92).

- settling round A 2990652, ends in 410s
- answer tx: CXhAfvzYGZbX4khYGNsdjv8iv6A6qxNetzZwabpUn1Bu
- round A record: {"round_id":2990652,"total_offered":"3000000000000000000000","offerer_count":6,"status":"Passed","last_offerer":"altar-proof6.testnet","minted":"6750000000000000000000","burned":"3000000000000000000000","feast_paid":"0","streak_after":1,"oracle_prediction":"Pass","oracle_outcome":"correct","oracle_rewarded":"10000000000000000000","oracle_burned":"0"}
- get_oracle after round A: {"oracle":"altar-oracle.testnet","prediction":null,"correct":2,"wrong":1,"total_staked":"300000000000000000000","total_rewarded":"20000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- ROUND A DONE: prediction Pass, outcome correct, rewarded 10000000000000000000, burned 0, answer CXhAfvzYGZbX4khYGNsdjv8iv6A6qxNetzZwabpUn1Bu
- --- round B (fallback) 2990653, ends in 590s, threshold 2581431327583807602860
- offer 500 altar-proof1.testnet: Bwz2KifZxVRtHU1oNHLgsYh7LekGKKMuwuiVBHJ5L7q3
- offer 500 altar-proof2.testnet: 532ovrqJsDjm5YQtUGRED4tx8Lhni5EEooY4e5LCLUYw
- offer 500 altar-proof3.testnet: BveGAFd9vPMR2a1NEgnvVL9FFzM9GKrsiXSoGTMahNf6
- offer 500 altar-proof4.testnet: B3GaD5PGcP31Sas4NUyek4kYVNBToiVSogKB21dkrDf2
- offer 500 altar-proof5.testnet: GhVM6NjeDGz2s1kX66WswvoSSSauDkbN11B62mnHeLca
- offer 500 altar-proof6.testnet: GtGWdvLzRmS2hnKAdF18btZeSUg4KCSfVSAZQKxxBGzY
- round 2990653 after offers: total_offered=3000000000000000000000 offerer_count=6 threshold=2581431327583807602860
- oracle agent: oracle: contract altar-ritual-v3-demo.testnet round 2990653, ends in 574s
- oracle agent: oracle: offered 3000000000000000000000 of line 2581431327583807602860, offerers 6 of 5, streak 1
- oracle agent: oracle: rule says PASS (Offered 116% of the line with 120% of the offerers needed, so I expect a pass.)
- oracle agent: oracle: --no-ai given, using the rule fallback to prove the fallback path.
- oracle agent: oracle: prediction PASS via rule fallback — Offered 116% of the line with 120% of the offerers needed, so I expect a pass.
- oracle agent: Receipt: D3ZP9dsG3WGaCi95wzJFcayknm7R1YozvdvL9kjQ7yNU
- oracle agent: 	Log [altar-ritual-v3-demo.testnet]: EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"altar-oracle.testnet","new_owner_id":"altar-ritual-v3-demo.testnet","amount":"100000000000000000000"}]}
- oracle agent: oracle: oracle_predict tx: EK21v8jycy9xpAY1XQk2zNPNkuXEnuYdfDUQUYBERDJj
- oracle agent: oracle: get_oracle after: {"oracle":"altar-oracle.testnet","prediction":null,"correct":2,"wrong":1,"total_staked":"300000000000000000000","total_rewarded":"20000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- oracle agent: oracle: wrote /home/hatch/workspace/altar/site/oracle-latest.json
- oracle agent: ORACLE PREDICTED
- get_oracle in round B: {"oracle":"altar-oracle.testnet","prediction":{"round_id":2990653,"prediction":"Pass","stake":"100000000000000000000"},"correct":2,"wrong":1,"total_staked":"400000000000000000000","total_rewarded":"20000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- oracle-latest.json after round B prediction: {"contract":"altar-ritual-v3-demo.testnet","round_id":2990653,"prediction":"Pass","reasoning":"Offered 116% of the line with 120% of the offerers needed, so I expect a pass.","path":"rule fallback","model":null,"chat_id":null,"verifiable":null,"updated_at":"2026-11-11T10:10:29.339Z"}
- waiting for round 2990653 to end...
- answer tx: J49CBmh8dW2GzZHjjfwmddkvdF76UkxggBwvQNkA7ktY
- round B record: {"round_id":2990653,"total_offered":"3000000000000000000000","offerer_count":6,"status":"Passed","last_offerer":"altar-proof6.testnet","minted":"6750000000000000000000","burned":"3000000000000000000000","feast_paid":"0","streak_after":2,"oracle_prediction":"Pass","oracle_outcome":"correct","oracle_rewarded":"10000000000000000000","oracle_burned":"0"}
- get_oracle after round B: {"oracle":"altar-oracle.testnet","prediction":null,"correct":3,"wrong":1,"total_staked":"400000000000000000000","total_rewarded":"30000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- ROUND B DONE: prediction Pass, outcome correct, rewarded 10000000000000000000, burned 0, answer J49CBmh8dW2GzZHjjfwmddkvdF76UkxggBwvQNkA7ktY
- final supply: 1037062531033523041144050
- NEAR AI ORACLE PROOF DONE

## Round C — NEAR AI on VeilProof's key (2026-11-11T10:21:24.732Z)

VeilProof's NEAR AI key (custom.near-ai-veilproof), model z-ai/glm-5.3-flash. The Genesis key is never used for the Oracle. Round 2990652's prediction used the Genesis key before the key rule was settled and is not claimed as the NEAR AI proof.

- --- round C (NEAR AI, VeilProof key) 2990654, ends in 515s, threshold 2588956327583807602860
- get_oracle before round C: {"oracle":"altar-oracle.testnet","prediction":null,"correct":3,"wrong":1,"total_staked":"400000000000000000000","total_rewarded":"30000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- offer 500 altar-proof1.testnet: 9fGPiPda2oW14JYUHzhQvwhwmjbaYbg5bdVEkC9JvnpR
- offer 500 altar-proof2.testnet: D4o7ceSpDrWKrwKRuEcZgsgEGxo1B7LNBMqnmZLVBLdK
- offer 500 altar-proof3.testnet: 6DVezJ5goHUaicxgW1tsrufeY4pSkDxB5PPXN2J8yehF
- offer 500 altar-proof4.testnet: 8TFkR6aWP7yk5pD5BuyDKQGk64jmSWo5wSeGgi2Umsrn
- offer 500 altar-proof5.testnet: C4TDXgJpFe9bAeoeBiRCJuSszKGeYdbimbcTeGt8B3G8
- offer 500 altar-proof6.testnet: CNFGCdEJrHM5sGyfCFJtWhkPjzwGvBW8DUEjYNqJPfVj
- round 2990654 after offers: total_offered=3000000000000000000000 offerer_count=6 threshold=2588956327583807602860
- oracle agent: oracle: contract altar-ritual-v3-demo.testnet round 2990654, ends in 499s
- oracle agent: oracle: offered 3000000000000000000000 of line 2588956327583807602860, offerers 6 of 5, streak 2
- oracle agent: oracle: rule says PASS (Offered 115% of the line with 120% of the offerers needed, so I expect a pass.)
- oracle agent: oracle: asking NEAR AI (z-ai/glm-5.3-flash)...
- oracle agent: oracle: NEAR AI says PASS (The offering of 3000 already exceeds the line of 2588.95 and six offerers surpass the five required, so the round has effectively secured its pass.)
- oracle agent: oracle: NEAR AI call verifiable=true chat_id=9dc5aeb60e514b129219a9d0498df9fd attestation_present=true
- oracle agent: oracle: prediction PASS via near-ai — The offering of 3000 already exceeds the line of 2588.95 and six offerers surpass the five required, so the round has effectively secured its pass.
- oracle agent: Receipt: 9KB8RJYfNkgQWBvLh6T5ZPzmfWDCjGeiNRPnnDByuVSn
- oracle agent: 	Log [altar-ritual-v3-demo.testnet]: EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"altar-oracle.testnet","new_owner_id":"altar-ritual-v3-demo.testnet","amount":"100000000000000000000"}]}
- oracle agent: oracle: oracle_predict tx: Dcbm4TnSnhHYdWrbwKCqwD72uPpKzjqNbvGKeWcvfCJ6
- oracle agent: oracle: get_oracle after: {"oracle":"altar-oracle.testnet","prediction":{"round_id":2990654,"prediction":"Pass","stake":"100000000000000000000"},"correct":3,"wrong":1,"total_staked":"500000000000000000000","total_rewarded":"30000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- oracle agent: oracle: wrote /home/hatch/workspace/altar/site/oracle-latest.json
- oracle agent: ORACLE PREDICTED
- get_oracle in round C: {"oracle":"altar-oracle.testnet","prediction":{"round_id":2990654,"prediction":"Pass","stake":"100000000000000000000"},"correct":3,"wrong":1,"total_staked":"500000000000000000000","total_rewarded":"30000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- oracle-latest.json after round C prediction: {"contract":"altar-ritual-v3-demo.testnet","round_id":2990654,"prediction":"Pass","reasoning":"The offering of 3000 already exceeds the line of 2588.95 and six offerers surpass the five required, so the round has effectively secured its pass.","path":"near-ai","model":"z-ai/glm-5.3-flash","chat_id":"9dc5aeb60e514b129219a9d0498df9fd","verifiable":true,"updated_at":"2026-11-11T10:21:53.906Z"}
- waiting for round 2990654 to end...
- answer tx: 2Sxe1DQx4pQ6TZRBAvirnAXWyemnb9C78VLV3Exz59vt
- round C record: {"round_id":2990654,"total_offered":"3000000000000000000000","offerer_count":6,"status":"Passed","last_offerer":"altar-proof6.testnet","minted":"6750000000000000000000","burned":"3000000000000000000000","feast_paid":"0","streak_after":3,"oracle_prediction":"Pass","oracle_outcome":"correct","oracle_rewarded":"10000000000000000000","oracle_burned":"0"}
- get_oracle after round C: {"oracle":"altar-oracle.testnet","prediction":null,"correct":4,"wrong":1,"total_staked":"500000000000000000000","total_rewarded":"40000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- ROUND C DONE: prediction Pass, outcome correct, rewarded 10000000000000000000, burned 0, answer 2Sxe1DQx4pQ6TZRBAvirnAXWyemnb9C78VLV3Exz59vt
- final supply: 1040812531033523041144050
- VEILPROOF KEY NEAR AI PROOF DONE
