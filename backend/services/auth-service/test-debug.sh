#!/bin/bash
# Quick debug - run just ONE test to see if it passes
npm test -- tests/endpoints/auth-endpoints-comprehensive.test.ts --testNamePattern="GET /health" --forceExit
