# Container Changes Test - SSR Only

This page tests ssr:only render containers.

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld ssr:only uniqueId="ssr-only-1" />

<HelloWorld uniqueId="default-unique-id" />

<HelloWorld ssr:only uniqueId="ssr-only-2" />
