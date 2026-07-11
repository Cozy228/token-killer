# ctx · idempotency note — indexed
retried payment must dedup on the idempotency key, not on wall-clock time [m94fd4]
**`decisions`**
Idempotency Rule payments.md:3-6 [d98ed3]
3	## Idempotency Rule
4	Retry must be idempotent. A double-charge on redelivery is the failure we avoid.
5	Persist the idempotency key so a retried request dedups on a stable id.
Payments Service payments.md:1-6 [d42850]
1	# Payments Service
2	
3	## Idempotency Rule
4	Retry must be idempotent. A double-charge on redelivery is the failure we avoid.
5	Persist the idempotency key so a retried request dedups on a stable id.