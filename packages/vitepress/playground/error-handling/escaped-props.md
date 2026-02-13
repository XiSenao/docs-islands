# Error Handling Test - Escaped Props

This page validates that special characters in component tag attributes are preserved safely.

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld
  client:only
  uniqueid="escape-attr-e2e"
  title='He said "hello" & goodbye'
  data-note="it's fine"
/>
