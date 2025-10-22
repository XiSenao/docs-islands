# Markdown Changes Test - Complex Layout

This page tests complex markdown layouts with components.

## Section 1

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

Some content before the component.

<HelloWorld client:only />

## Section 2

More markdown content between components.

<Hello ssr:only />

## Section 3

Final section with a table:

| Column 1 | Column 2 | Column 3 |
| -------- | -------- | -------- |
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |
