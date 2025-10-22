# Script Content Changes Test - Multiple Components

This page tests adding new render component references.

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<HelloWorld client:only />
<Hello ssr:only />
