<script setup lang="ts">
import { useHeadsetController } from '../../composables/useHeadsetController'

const headset = useHeadsetController()
</script>

<template>
  <section class="section-content" aria-labelledby="profiles-title">
    <div class="section-heading">
      <p class="section-label">Stream profiles / Профили трансляции</p>
      <h2 id="profiles-title">Future scrcpy profiles</h2>
      <p class="muted-text">
        Profiles will later group geometry and quality settings for repeatable arena operation.
      </p>
    </div>

    <section class="info-card">
      <div class="card-header">
        <div>
          <p class="section-label">Current quick parameters</p>
          <h3>Active launch values</h3>
        </div>
      </div>

      <dl class="details-grid">
        <div>
          <dt>Target device</dt>
          <dd>{{ headset.address.value || 'Not set' }}</dd>
        </div>
        <div>
          <dt>Crop</dt>
          <dd>{{ headset.crop.value.trim() || 'Not passed to scrcpy' }}</dd>
        </div>
        <div>
          <dt>Audio</dt>
          <dd>{{ headset.noAudio.value ? 'Disabled with --no-audio' : 'Enabled' }}</dd>
        </div>
      </dl>

      <div class="state-message">
        Profile saving, geometry presets, bitrate, FPS and quality controls will be implemented later.
      </div>
    </section>
  </section>
</template>
