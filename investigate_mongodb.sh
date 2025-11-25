#!/bin/bash

echo "═══════════════════════════════════════════════════════════"
echo "🔍 MONGODB DEEP DIVE INVESTIGATION"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if MongoDB container is running
echo "1️⃣  Checking MongoDB container status..."
docker-compose ps mongodb 2>/dev/null || echo "MongoDB container not found in docker-compose"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Examining MongoDB Schema Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -d "database/mongodb/collections" ]; then
    echo ""
    echo "📊 Analytics collections:"
    find database/mongodb/collections/analytics -type f -name "*.js" 2>/dev/null | while read file; do
        echo "  📄 $(basename $file)"
        echo "     Size: $(wc -l < "$file") lines"
        # Check if file has any exports
        if grep -q "module.exports\|export" "$file"; then
            echo "     ✅ Has exports"
        else
            echo "     ⚠️  No exports found"
        fi
    done
    
    echo ""
    echo "📊 Content collections:"
    find database/mongodb/collections/content -type f -name "*.js" 2>/dev/null | while read file; do
        echo "  📄 $(basename $file)"
        echo "     Size: $(wc -l < "$file") lines"
    done
    
    echo ""
    echo "📊 Logs collections:"
    find database/mongodb/collections/logs -type f -name "*.js" 2>/dev/null | while read file; do
        echo "  📄 $(basename $file)"
        echo "     Size: $(wc -l < "$file") lines"
    done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Finding MongoDB Connections in Code"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "🔍 Searching for mongoose.connect()..."
grep -rn "mongoose.connect" backend/services --include="*.ts" --include="*.js" 2>/dev/null || echo "None found"

echo ""
echo "🔍 Searching for MongoClient usage..."
grep -rn "MongoClient" backend/services --include="*.ts" --include="*.js" 2>/dev/null | head -20 || echo "None found"

echo ""
echo "🔍 Searching for model definitions..."
grep -rn "mongoose.model\|new Schema" backend/services --include="*.ts" --include="*.js" 2>/dev/null | head -20 || echo "None found"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  Checking Which Services Import MongoDB Schemas"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "🔍 Looking for imports from database/mongodb/..."
grep -rn "from.*database/mongodb\|require.*database/mongodb" backend/services --include="*.ts" --include="*.js" 2>/dev/null || echo "None found"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  Checking Analytics Service Specifically"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -d "backend/services/analytics-service" ]; then
    echo ""
    echo "📦 Analytics service package.json dependencies:"
    cat backend/services/analytics-service/package.json | grep -A 20 '"dependencies"' | grep -E "mongo|mongoose"
    
    echo ""
    echo "🔍 MongoDB usage in analytics service:"
    find backend/services/analytics-service/src -type f \( -name "*.ts" -o -name "*.js" \) -exec grep -l "mongo\|Mongo" {} \; 2>/dev/null | head -10
    
    echo ""
    echo "🔍 Analytics service structure:"
    find backend/services/analytics-service/src -type f \( -name "*.ts" -o -name "*.js" \) | head -20
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  Actual MongoDB Collections in Running Instance"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker-compose ps mongodb 2>/dev/null | grep -q "Up"; then
    echo ""
    echo "📊 Attempting to list actual MongoDB databases and collections..."
    docker-compose exec -T mongodb mongosh --quiet --eval "
        db.adminCommand('listDatabases').databases.forEach(function(db) {
            print('Database: ' + db.name);
            if (db.name !== 'admin' && db.name !== 'config' && db.name !== 'local') {
                use(db.name);
                db.getCollectionNames().forEach(function(coll) {
                    print('  - Collection: ' + coll);
                    print('    Documents: ' + db.getCollection(coll).countDocuments());
                });
            }
        });
    " 2>/dev/null || echo "Could not connect to MongoDB"
else
    echo "⚠️  MongoDB container is not running"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Investigation complete!"
echo "═══════════════════════════════════════════════════════════"

