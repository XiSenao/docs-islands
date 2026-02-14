# Case Sensitivity - Multiple Components

Verifies that two different PascalCase components are correctly distinguished.

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<HelloWorld uniqueId="multi-hello-world" />
<Hello uniqueId="multi-hello" />
