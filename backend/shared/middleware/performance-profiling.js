const fs = require('fs');
const path = require('path');
const { performance, PerformanceObserver } = require('perf_hooks');

class PerformanceProfiler {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.profiles = new Map();
    this.metrics = {
      slowQueries: [],
      memoryLeaks: [],
      gcStats: []
    };
    
    this.setupObservers();
  }

  setupObservers() {
    // Garbage collection observer (if available)
    try {
      const obs = new PerformanceObserver((items) => {
        items.getEntries().forEach((entry) => {
          this.metrics.gcStats.push({
            timestamp: Date.now(),
            duration: entry.duration,
            type: entry.name
          });
        });
      });
      obs.observe({ entryTypes: ['gc'] });
    } catch (e) {
      // GC monitoring not available
    }
  }

  // Simple CPU profiling using performance marks
  startCPUProfile(profileId = 'cpu-profile') {
    performance.mark(`${profileId}-start`);
    this.profiles.set(profileId, { 
      type: 'cpu', 
      startTime: Date.now(),
      startCpu: process.cpuUsage()
    });
  }

  // Stop CPU profiling
  stopCPUProfile(profileId = 'cpu-profile') {
    performance.mark(`${profileId}-end`);
    const profile = this.profiles.get(profileId);
    
    if (profile) {
      const endCpu = process.cpuUsage(profile.startCpu);
      const duration = Date.now() - profile.startTime;
      
      performance.measure(profileId, `${profileId}-start`, `${profileId}-end`);
      
      this.profiles.delete(profileId);
      
      return {
        duration,
        cpu: {
          user: endCpu.user,
          system: endCpu.system
        }
      };
    }
    
    return null;
  }

  // Simple heap snapshot (just memory stats)
  takeHeapSnapshot() {
    const memUsage = process.memoryUsage();
    return {
      timestamp: Date.now(),
      heap: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal
      },
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss
    };
  }

  // Memory leak detection
  detectMemoryLeak(threshold = 100 * 1024 * 1024) { // 100MB
    const memUsage = process.memoryUsage();
    
    if (memUsage.heapUsed > threshold) {
      this.metrics.memoryLeaks.push({
        timestamp: Date.now(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      });
      return true;
    }
    return false;
  }

  // Track slow database queries
  trackSlowQuery(query, duration, threshold = 1000) {
    if (duration > threshold) {
      this.metrics.slowQueries.push({
        timestamp: Date.now(),
        query: query.substring(0, 200),
        duration,
        threshold
      });
      
      // Keep only last 100 slow queries
      if (this.metrics.slowQueries.length > 100) {
        this.metrics.slowQueries.shift();
      }
    }
  }

  // Get profiling metrics
  getMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      service: this.serviceName,
      timestamp: Date.now(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      gc: {
        count: this.metrics.gcStats.length,
        totalDuration: this.metrics.gcStats.reduce((a, b) => a + b.duration, 0),
        lastGC: this.metrics.gcStats[this.metrics.gcStats.length - 1]
      },
      slowQueries: this.metrics.slowQueries.length,
      memoryLeaks: this.metrics.memoryLeaks.length
    };
  }

  // Express middleware for profiling endpoints
  middleware() {
    const router = require('express').Router();
    
    router.post('/cpu/start', (req, res) => {
      const profileId = req.body.id || 'cpu-profile';
      this.startCPUProfile(profileId);
      res.json({ message: 'CPU profiling started', profileId });
    });
    
    router.post('/cpu/stop', (req, res) => {
      const profileId = req.body.id || 'cpu-profile';
      const profileData = this.stopCPUProfile(profileId);
      
      res.json({ 
        message: 'CPU profiling stopped',
        profile: profileData
      });
    });
    
    router.get('/heap', (req, res) => {
      const snapshotData = this.takeHeapSnapshot();
      res.json({
        message: 'Heap snapshot taken',
        snapshot: snapshotData
      });
    });
    
    router.get('/metrics', (req, res) => {
      res.json(this.getMetrics());
    });
    
    return router;
  }
}

module.exports = PerformanceProfiler;
