# Error Handling Test - Invalid Render Directive

This page uses invalid render directives.

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld invalid:directive uniqueId="invalid-directive" />
<HelloWorld client:invalid uniqueId="client-invalid" />
