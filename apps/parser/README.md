# parser

Python parsing service. Minimal always-on HTTP service, single internal
`POST /parse` endpoint, zero exposed ports — reachable only by `backend` over
Docker's internal network. See milestone M4.
