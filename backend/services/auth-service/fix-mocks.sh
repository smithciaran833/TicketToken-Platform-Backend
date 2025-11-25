#!/bin/bash

cd tests/unit/services

for file in *.test.ts; do
  echo "Fixing $file..."
  
  # Create temp file with fixed mocks
  awk '
    /^jest\.mock\(.bcrypt.\);/ {
      print "jest.mock('\''bcrypt'\'', () => ({"
      print "  hash: jest.fn().mockResolvedValue('\''hashed_password'\''),"
      print "  compare: jest.fn().mockResolvedValue(true)"
      print "}));"
      next
    }
    { print }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  
done

echo "All mocks fixed!"
