const { InfluxDB, Point } = require('@influxdata/influxdb-client');

async function testInfluxFromHost() {
  console.log('=== Testing InfluxDB Connection from Host ===\n');
  
  // Use localhost since we're running from host machine
  const client = new InfluxDB({
    url: 'http://localhost:8087',  // Port mapped to host
    token: 'my-super-secret-auth-token',
  });

  const writeApi = client.getWriteApi('tickettoken', 'metrics', 'ms');
  writeApi.useDefaultTags({ service: 'test' });

  try {
    console.log('1. Writing test metrics...');
    
    const point1 = new Point('page_views')
      .tag('venue_id', 'venue-789')
      .tag('page', 'homepage')
      .floatField('value', 42);
    
    writeApi.writePoint(point1);
    
    const point2 = new Point('ticket_sales')
      .tag('venue_id', 'venue-789')
      .tag('event', 'concert-1')
      .floatField('value', 10);
    
    writeApi.writePoint(point2);
    
    await writeApi.flush();
    console.log('✅ Metrics written successfully!');
    
    await writeApi.close();
    
    console.log('\n2. Verifying data in InfluxDB...');
    console.log('Run this command to check:');
    console.log('docker-compose exec influxdb influx query --org tickettoken --token my-super-secret-auth-token \'from(bucket: "metrics") |> range(start: -5m) |> filter(fn: (r) => r.venue_id == "venue-789")\'');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testInfluxFromHost();
