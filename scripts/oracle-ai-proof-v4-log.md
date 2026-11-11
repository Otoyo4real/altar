
## Round C — NEAR AI on VeilProof's key (2026-11-11T15:10:31.127Z)

VeilProof's NEAR AI key (custom.near-ai-veilproof), model z-ai/glm-5.3-flash. The Genesis key is never used for the Oracle. Round 2990652's prediction used the Genesis key before the key rule was settled and is not claimed as the NEAR AI proof.

- --- round C (NEAR AI, VeilProof key) 2990683, ends in 569s, threshold 2573906327583807602860
- get_oracle before round C: {"oracle":"altar-oracle.testnet","prediction":null,"correct":1,"wrong":1,"total_staked":"200000000000000000000","total_rewarded":"10000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- offer 500 altar-proof1.testnet: 57mwUFZVo9Wn2YKyf5LxfrXvm1qe6HiBVjCmU2AKFsvU
- offer 500 altar-proof2.testnet: 7kVbwrCKkFWQFqLDQ1ZrvBTis84mrhfhGC52irdspqZj
- offer 500 altar-proof3.testnet: 5tLeovUuqijAtHygErPcWReeTVfDyYUrVwRkCG6JkQ7P
- offer 500 altar-proof4.testnet: XUn8j5EpTL1XeezN4qBQSgWuW4uL7p9M4RL7T7JSj7b
- offer 500 altar-proof5.testnet: 8VrBCF6xXSUcZNmunwq75p4ndzfhyvcEerrHHFa3aEtQ
- offer 500 altar-proof6.testnet: 9f1yYYkuYt5hJLHBcrjx7yNjEDxrpQy3kjtxsVLX2b6z
- round 2990683 after offers: total_offered=3000000000000000000000 offerer_count=6 threshold=2573906327583807602860
- oracle agent: oracle: contract altar-ritual-v4-demo.testnet round 2990683, ends in 552s
- oracle agent: oracle: offered 3000000000000000000000 of line 2573906327583807602860, offerers 6 of 5, streak 7
- oracle agent: oracle: fund 4910 ALTAR (top-up line 500)
- oracle agent: oracle: fund is above the top-up line, no top-up.
- oracle agent: oracle: rule says PASS (Offered 116% of the line with 120% of the offerers needed, so I expect a pass.)
- oracle agent: oracle: asking NEAR AI (z-ai/glm-5.3-flash)...
- oracle agent: oracle: NEAR AI says PASS (Both thresholds are already exceeded with 3000 offered against a 2573.90 line and 6 of 5 wallets, and offers cannot be withdrawn, so passing is all but certain.)
- oracle agent: oracle: NEAR AI call verifiable=true chat_id=72d4dd785b28451e8d75e830850f459b attestation_present=true
- oracle agent: oracle: prediction PASS via near-ai — Both thresholds are already exceeded with 3000 offered against a 2573.90 line and 6 of 5 wallets, and offers cannot be withdrawn, so passing is all but certain.
- oracle agent: Receipt: 5fw4Fs5gCt8kwai4sE2xihmusi4EAdqneNAq3iDpi7Jg
- oracle agent: 	Log [altar-ritual-v4-demo.testnet]: EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"altar-oracle.testnet","new_owner_id":"altar-ritual-v4-demo.testnet","amount":"100000000000000000000"}]}
- oracle agent: oracle: oracle_predict tx: 2TUvuzUh9EjyLNNHiRtz18d7uvWezyRXUJz1ukJwm3d5
- oracle agent: oracle: get_oracle after: {"oracle":"altar-oracle.testnet","prediction":{"round_id":2990683,"prediction":"Pass","stake":"100000000000000000000"},"correct":1,"wrong":1,"total_staked":"300000000000000000000","total_rewarded":"10000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- oracle agent: oracle: wrote /home/hatch/workspace/altar/site/oracle-latest.json
- oracle agent: ORACLE PREDICTED
- get_oracle in round C: {"oracle":"altar-oracle.testnet","prediction":{"round_id":2990683,"prediction":"Pass","stake":"100000000000000000000"},"correct":1,"wrong":1,"total_staked":"300000000000000000000","total_rewarded":"10000000000000000000","total_burned":"100000000000000000000","stake_amount":"100000000000000000000","reward_amount":"10000000000000000000"}
- oracle-latest.json after round C prediction: {"contract":"altar-ritual-v4-demo.testnet","round_id":2990683,"prediction":"Pass","reasoning":"Both thresholds are already exceeded with 3000 offered against a 2573.90 line and 6 of 5 wallets, and offers cannot be withdrawn, so passing is all but certain.","path":"near-ai","model":"z-ai/glm-5.3-flash","chat_id":"72d4dd785b28451e8d75e830850f459b","verifiable":true,"updated_at":"2026-11-11T15:11:22.758Z"}
- waiting for round 2990683 to end...
